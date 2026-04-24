require "base64"
require "date"
require "json"
require "openssl"
require "securerandom"
require "time"
require "webrick"

ROOT = File.expand_path(__dir__)
PUBLIC_ROOT = File.join(ROOT, "public")
PORT = Integer(ENV.fetch("PORT", "4174"))
DEFAULT_AUTH_EMAIL = "team@giftflow.local"
DEFAULT_AUTH_PASSWORD = "giftflow-demo"
AUTH_EMAIL = ENV.fetch("AUTH_EMAIL", DEFAULT_AUTH_EMAIL).strip.downcase
AUTH_PASSWORD = ENV.fetch("AUTH_PASSWORD", DEFAULT_AUTH_PASSWORD)
AUTH_NAME = ENV.fetch("AUTH_NAME", "GiftFlow Team").strip
USING_DEFAULT_CREDENTIALS = ENV["AUTH_EMAIL"].nil? || ENV["AUTH_PASSWORD"].nil?
SESSION_SECRET = ENV.fetch("SESSION_SECRET", "development-only-change-me")
SESSION_COOKIE = "giftflow_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7

MIME_TYPES = WEBrick::HTTPUtils::DefaultMimeTypes.merge(
  "js" => "application/javascript",
  "css" => "text/css",
  "json" => "application/json"
)

def parse_date(value)
  return nil if value.nil? || value.to_s.strip.empty?

  Date.iso8601(value.to_s)
rescue ArgumentError
  nil
end

def template(text, recipient, campaign)
  text.to_s.gsub(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/) do
    key = Regexp.last_match(1)
    case key
    when "firstName"
      recipient.fetch("name", "").split(/\s+/).first.to_s
    when "name"
      recipient.fetch("name", "").to_s
    when "company"
      recipient.fetch("company", "").to_s
    when "campaign"
      campaign.fetch("name", "").to_s
    when "owner"
      campaign.fetch("owner", "").to_s
    else
      ""
    end
  end
end

def sequence_signature(steps)
  comparable = steps.map do |step|
    [
      step["order"].to_i,
      step["name"].to_s,
      step["sendDate"].to_s,
      step["itemName"].to_s,
      step["asin"].to_s,
      step["itemUrl"].to_s,
      step["quantity"].to_i,
      step["message"].to_s,
      step["emailSubjectWhenSent"].to_s,
      step["emailBodyWhenSent"].to_s,
      step["emailSubjectWhenDelivered"].to_s,
      step["emailBodyWhenDelivered"].to_s,
      step["note"].to_s
    ]
  end

  JSON.generate(comparable)
end

def present?(value)
  !value.nil? && !value.to_s.strip.empty?
end

def json_response(response, body, status = 200)
  response.status = status
  response["Content-Type"] = "application/json"
  response.body = JSON.pretty_generate(body)
end

def base64url_encode(value)
  Base64.urlsafe_encode64(value).delete("=")
end

def base64url_decode(value)
  padding = "=" * ((4 - value.length % 4) % 4)
  Base64.urlsafe_decode64(value + padding)
end

def session_signature(payload)
  OpenSSL::HMAC.hexdigest("SHA256", SESSION_SECRET, payload)
end

def secure_compare(left, right)
  left = left.to_s
  right = right.to_s
  return false unless left.bytesize == right.bytesize

  if OpenSSL.respond_to?(:fixed_length_secure_compare)
    OpenSSL.fixed_length_secure_compare(left, right)
  else
    result = 0
    left.bytes.zip(right.bytes) { |left_byte, right_byte| result |= left_byte ^ right_byte }
    result.zero?
  end
end

def session_cookie(user)
  payload = user.merge("expiresAt" => (Time.now.utc + SESSION_MAX_AGE).iso8601)
  encoded = base64url_encode(JSON.generate(payload))
  signature = session_signature(encoded)
  "#{SESSION_COOKIE}=#{encoded}.#{signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=#{SESSION_MAX_AGE}"
end

def clear_session_cookie
  "#{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
end

def request_cookies(request)
  request.cookies.to_h { |cookie| [cookie.name, cookie.value] }
end

def current_user(request)
  raw = request_cookies(request)[SESSION_COOKIE].to_s
  encoded, signature = raw.split(".", 2)
  return nil unless present?(encoded) && present?(signature)
  return nil unless secure_compare(session_signature(encoded), signature)

  user = JSON.parse(base64url_decode(encoded))
  return nil if Time.parse(user.fetch("expiresAt")) < Time.now.utc

  user
rescue JSON::ParserError, ArgumentError, KeyError
  nil
end

def authenticate_user(email, password)
  raise "Authentication is not configured. Set AUTH_EMAIL and AUTH_PASSWORD before starting the server." unless present?(AUTH_EMAIL) && present?(AUTH_PASSWORD)

  normalized_email = email.to_s.strip.downcase
  password_value = password.to_s

  valid_email = secure_compare(normalized_email, AUTH_EMAIL)
  valid_password = secure_compare(password_value, AUTH_PASSWORD)
  raise "Email or password is incorrect." unless valid_email && valid_password

  {
    "sub" => "local-auth:#{AUTH_EMAIL}",
    "email" => AUTH_EMAIL,
    "name" => AUTH_NAME.empty? ? AUTH_EMAIL.split("@").first : AUTH_NAME,
    "picture" => "",
    "hostedDomain" => "",
    "onboarded" => false,
    "signedInAt" => Time.now.utc.iso8601
  }
end

def require_user(request, response)
  user = current_user(request)
  return user if user

  json_response(response, { ok: false, errors: ["Sign in to continue."] }, 401)
  nil
end

def ready_for_live_amazon?(state)
  amazon = state.fetch("amazon", {})
  %w[clientId refreshToken marketplace endpoint].all? { |key| present?(amazon[key]) }
end

def process_orders(state, run_date)
  campaign = state.fetch("campaign", {})
  steps = state.fetch("steps", [])
  recipients = state.fetch("recipients", [])
  execution = state.fetch("execution", {})
  existing_history = state.fetch("orderHistory", [])
  today = parse_date(run_date) || Date.today
  signature = sequence_signature(steps)
  confirmed_signature = execution["confirmedSequenceSignature"].to_s
  sequence_confirmed = execution["sequenceConfirmedAt"].to_s != "" && confirmed_signature == signature
  amazon_mode = execution.fetch("amazonMode", "queue-only")

  errors = []
  errors << "Confirm the gift sequence before automation runs." unless sequence_confirmed

  valid_steps = steps.select do |step|
    due_date = parse_date(step["sendDate"])
    due_date && due_date <= today && present?(step["itemName"]) && (present?(step["asin"]) || present?(step["itemUrl"]))
  end

  eligible_recipients = recipients.select do |recipient|
    recipient["readyToSend"] == true &&
      present?(recipient["name"]) &&
      present?(recipient["street"]) &&
      present?(recipient["city"]) &&
      present?(recipient["state"]) &&
      present?(recipient["zip"])
  end

  if valid_steps.empty?
    errors << "No gift steps are due as of #{today.iso8601}."
  end

  if eligible_recipients.empty?
    errors << "No prospects are marked ready with complete shipping addresses."
  end

  created = []
  history = existing_history.dup
  existing_keys = history.map { |record| record["dedupeKey"].to_s }.to_h { |key| [key, true] }

  if errors.empty?
    eligible_recipients.each do |recipient|
      valid_steps.each do |step|
        dedupe_key = "#{recipient.fetch("id", recipient["email"])}:#{step.fetch("id", step["order"])}"
        next if existing_keys[dedupe_key]

        status =
          case amazon_mode
          when "amazon-business-api"
            ready_for_live_amazon?(state) ? "ready_for_live_connector" : "needs_amazon_credentials"
          when "sandbox"
            "simulated"
          else
            "queued_for_review"
          end

        record = {
          "id" => SecureRandom.uuid,
          "dedupeKey" => dedupe_key,
          "status" => status,
          "createdAt" => Time.now.utc.iso8601,
          "runDate" => today.iso8601,
          "campaignName" => campaign.fetch("name", ""),
          "recipientId" => recipient.fetch("id", ""),
          "recipientName" => recipient.fetch("name", ""),
          "recipientEmail" => recipient.fetch("email", ""),
          "company" => recipient.fetch("company", ""),
          "assignedTo" => recipient.fetch("assignedTo", ""),
          "stepId" => step.fetch("id", ""),
          "stepName" => step.fetch("name", ""),
          "sendDate" => step.fetch("sendDate", ""),
          "itemName" => step.fetch("itemName", ""),
          "asin" => step.fetch("asin", ""),
          "itemUrl" => step.fetch("itemUrl", ""),
          "quantity" => [step["quantity"].to_i, 1].max,
          "giftMessage" => template(step["message"], recipient, campaign),
          "shippingAddress" => {
            "name" => recipient.fetch("name", ""),
            "street" => recipient.fetch("street", ""),
            "city" => recipient.fetch("city", ""),
            "state" => recipient.fetch("state", ""),
            "zip" => recipient.fetch("zip", "")
          },
          "amazonPayload" => {
            "marketplace" => state.fetch("amazon", {}).fetch("marketplace", ""),
            "asin" => step.fetch("asin", ""),
            "url" => step.fetch("itemUrl", ""),
            "quantity" => [step["quantity"].to_i, 1].max,
            "giftMessage" => template(step["message"], recipient, campaign),
            "shippingDefaults" => execution.fetch("shippingDefaults", "")
          }
        }

        history << record
        created << record
        existing_keys[dedupe_key] = true
      end
    end
  end

  {
    "ok" => errors.empty?,
    "errors" => errors,
    "summary" => {
      "runDate" => today.iso8601,
      "dueSteps" => valid_steps.length,
      "eligibleRecipients" => eligible_recipients.length,
      "createdOrders" => created.length,
      "skippedDuplicates" => existing_history.length + (valid_steps.length * eligible_recipients.length) - history.length,
      "mode" => amazon_mode
    },
    "createdOrders" => created,
    "state" => state.merge(
      "orderHistory" => history,
      "execution" => execution.merge(
        "lastRunAt" => Time.now.utc.iso8601,
        "lastRunDate" => today.iso8601
      )
    )
  }
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  DocumentRoot: PUBLIC_ROOT,
  MimeTypes: MIME_TYPES,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)

server.mount_proc("/api/health") do |_request, response|
  json_response(response, { ok: true, service: "gift-campaigns", port: PORT })
end

server.mount_proc("/api/auth/config") do |request, response|
  json_response(response, {
    ok: true,
    configured: present?(AUTH_EMAIL) && present?(AUTH_PASSWORD),
    authMode: "password",
    usingDefaultCredentials: USING_DEFAULT_CREDENTIALS,
    user: current_user(request)
  })
end

server.mount_proc("/api/auth/session") do |request, response|
  user = current_user(request)
  json_response(response, { ok: true, authenticated: !!user, user: user })
end

server.mount_proc("/api/auth/login") do |request, response|
  begin
    payload = JSON.parse(request.body.to_s)
    user = authenticate_user(payload["email"], payload["password"])
    response["Set-Cookie"] = session_cookie(user)
    json_response(response, { ok: true, user: user })
  rescue JSON::ParserError
    json_response(response, { ok: false, errors: ["Request body must be valid JSON."] }, 400)
  rescue StandardError => error
    json_response(response, { ok: false, errors: [error.message] }, 401)
  end
end

server.mount_proc("/api/auth/onboarding") do |request, response|
  user = require_user(request, response)
  next unless user

  begin
    payload = JSON.parse(request.body.to_s)
    onboarding = {
      "companyName" => payload["companyName"].to_s.strip,
      "teamName" => payload["teamName"].to_s.strip,
      "role" => payload["role"].to_s.strip,
      "useCase" => payload["useCase"].to_s.strip,
      "completedAt" => Time.now.utc.iso8601
    }
    updated_user = user.merge("onboarded" => true, "onboarding" => onboarding)
    response["Set-Cookie"] = session_cookie(updated_user)
    json_response(response, { ok: true, user: updated_user })
  rescue JSON::ParserError
    json_response(response, { ok: false, errors: ["Request body must be valid JSON."] }, 400)
  end
end

server.mount_proc("/api/auth/logout") do |_request, response|
  response["Set-Cookie"] = clear_session_cookie
  json_response(response, { ok: true })
end

server.mount_proc("/api/orders/process") do |request, response|
  next unless require_user(request, response)

  begin
    payload = JSON.parse(request.body.to_s)
    state = payload.fetch("state")
    run_date = payload.fetch("runDate", Date.today.iso8601)
    json_response(response, process_orders(state, run_date))
  rescue JSON::ParserError
    json_response(response, { ok: false, errors: ["Request body must be valid JSON."] }, 400)
  rescue KeyError => error
    json_response(response, { ok: false, errors: ["Missing required field: #{error.key}"] }, 422)
  rescue StandardError => error
    json_response(response, { ok: false, errors: [error.message] }, 500)
  end
end

server.mount_proc("/") do |request, response|
  path = request.path == "/" ? "/index.html" : request.path
  file_path = File.expand_path(File.join(PUBLIC_ROOT, path))

  if file_path.start_with?(PUBLIC_ROOT) && File.file?(file_path)
    response.body = File.binread(file_path)
    response["Content-Type"] = WEBrick::HTTPUtils.mime_type(file_path, MIME_TYPES)
  else
    response.status = 404
    response.body = "Not found"
  end
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

puts "Gift campaign studio running at http://127.0.0.1:#{PORT}"
server.start
