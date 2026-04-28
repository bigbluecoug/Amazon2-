require "base64"
require "date"
require "json"
require "net/http"
require "openssl"
require "securerandom"
require "time"
require "uri"
require "webrick"

ROOT = File.expand_path(__dir__)
PUBLIC_ROOT = File.join(ROOT, "public")
DATA_ROOT = File.join(ROOT, "data")
GIFT_IDEAS_FILE = File.join(DATA_ROOT, "gift-ideas.json")

def load_env_file(path)
  return unless File.file?(path)

  File.readlines(path, chomp: true).each do |line|
    line = line.strip
    next if line.empty? || line.start_with?("#") || !line.include?("=")

    key, value = line.split("=", 2)
    key = key.strip
    value = value.to_s.strip
    next if key.empty? || ENV.key?(key)

    quote = value[0]
    value = value[1...-1] if ["\"", "'"].include?(quote) && value.end_with?(quote)
    ENV[key] = value
  end
end

load_env_file(File.join(ROOT, ".env"))

PORT = Integer(ENV.fetch("PORT", "4174"))
DEFAULT_AUTH_EMAIL = "team@giftflow.local"
DEFAULT_AUTH_PASSWORD = "giftflow-demo"
DEMO_LOGIN_ENABLED = ENV.fetch("ALLOW_DEMO_LOGIN", "false").strip.downcase == "true"
AUTH_EMAIL = ENV.fetch("AUTH_EMAIL", DEMO_LOGIN_ENABLED ? DEFAULT_AUTH_EMAIL : "").strip.downcase
AUTH_PASSWORD = ENV.fetch("AUTH_PASSWORD", DEMO_LOGIN_ENABLED ? DEFAULT_AUTH_PASSWORD : "")
AUTH_NAME = ENV.fetch("AUTH_NAME", "GiftFlow Team").strip
GIFT_IDEA_ADMIN_EMAILS = ENV.fetch("GIFT_IDEA_ADMIN_EMAILS", AUTH_EMAIL).split(",").map { |email| email.strip.downcase }.reject(&:empty?)
USING_DEFAULT_CREDENTIALS = DEMO_LOGIN_ENABLED && (ENV["AUTH_EMAIL"].nil? || ENV["AUTH_PASSWORD"].nil?)
SESSION_SECRET = ENV.fetch("SESSION_SECRET", "development-only-change-me")
SESSION_COOKIE = "giftflow_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7
GOOGLE_STATE_COOKIE = "giftflow_google_state"
GOOGLE_STATE_MAX_AGE = 600
GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_CLIENT_ID = ENV.fetch("GOOGLE_CLIENT_ID", "").strip
GOOGLE_CLIENT_SECRET = ENV.fetch("GOOGLE_CLIENT_SECRET", "").strip
GOOGLE_REDIRECT_URI = ENV.fetch("GOOGLE_REDIRECT_URI", "").strip
GOOGLE_ALLOWED_EMAILS = ENV.fetch("GOOGLE_ALLOWED_EMAILS", AUTH_EMAIL).split(",").map { |email| email.strip.downcase }.reject(&:empty?)
GOOGLE_ALLOWED_DOMAINS = ENV.fetch("GOOGLE_ALLOWED_DOMAINS", "").split(",").map { |domain| domain.strip.downcase.delete_prefix("@") }.reject(&:empty?)

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

def default_gift_ideas
  [
    {
      "title" => "Premium coffee sampler",
      "query" => "premium coffee sampler gift box",
      "imageUrl" => "",
      "message" => "Hi {{firstName}}, thought this would make your next planning session a little better. - {{owner}}"
    },
    {
      "title" => "Desk notebook set",
      "query" => "premium desk notebook set",
      "imageUrl" => "",
      "message" => "Hi {{firstName}}, a useful place for the next round of big ideas. - {{owner}}"
    },
    {
      "title" => "Insulated desk tumbler",
      "query" => "insulated desk tumbler gift",
      "imageUrl" => "",
      "message" => "Hi {{firstName}}, hope this keeps the good ideas fueled. - {{owner}}"
    },
    {
      "title" => "Wireless charging stand",
      "query" => "wireless charging stand desk",
      "imageUrl" => "",
      "message" => "Hi {{firstName}}, a small desk upgrade for the workday. - {{owner}}"
    }
  ]
end

def sanitize_gift_idea(idea)
  {
    "title" => idea.fetch("title", "").to_s.strip,
    "query" => idea.fetch("query", "").to_s.strip,
    "imageUrl" => idea.fetch("imageUrl", "").to_s.strip,
    "imageUrlSavedAt" => idea.fetch("imageUrlSavedAt", "").to_s.strip,
    "message" => idea.fetch("message", "").to_s.strip
  }
end

def read_gift_ideas
  return default_gift_ideas unless File.file?(GIFT_IDEAS_FILE)

  parsed = JSON.parse(File.read(GIFT_IDEAS_FILE))
  return default_gift_ideas unless parsed.is_a?(Array)

  parsed.map { |idea| sanitize_gift_idea(idea) }.select { |idea| present?(idea["title"]) && present?(idea["query"]) }
rescue JSON::ParserError
  default_gift_ideas
end

def write_gift_ideas(ideas)
  cleaned = ideas.map { |idea| sanitize_gift_idea(idea) }.select { |idea| present?(idea["title"]) && present?(idea["query"]) }
  raise "Add at least one gift idea with a title and Amazon search query." if cleaned.empty?

  Dir.mkdir(DATA_ROOT) unless Dir.exist?(DATA_ROOT)
  File.write(GIFT_IDEAS_FILE, JSON.pretty_generate(cleaned) + "\n")
  cleaned
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

def password_login_configured?
  present?(AUTH_EMAIL) && present?(AUTH_PASSWORD)
end

def google_login_configured?
  present?(GOOGLE_CLIENT_ID) &&
    present?(GOOGLE_CLIENT_SECRET) &&
    (GOOGLE_ALLOWED_EMAILS.any? || GOOGLE_ALLOWED_DOMAINS.any?)
end

def request_origin(request)
  proto = request["x-forwarded-proto"].to_s.split(",").first.to_s.strip
  proto = request.ssl? ? "https" : "http" if proto.empty?
  host = request["x-forwarded-host"].to_s.strip
  host = request["host"].to_s.strip if host.empty?
  host = "127.0.0.1:#{PORT}" if host.empty?
  "#{proto}://#{host}"
end

def google_redirect_uri(request)
  GOOGLE_REDIRECT_URI.empty? ? "#{request_origin(request)}/api/auth/google/callback" : GOOGLE_REDIRECT_URI
end

def google_authorization_url(state, request)
  uri = URI(GOOGLE_AUTH_ENDPOINT)
  uri.query = URI.encode_www_form(
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: google_redirect_uri(request),
    response_type: "code",
    scope: "openid profile email",
    state: state,
    prompt: "select_account"
  )
  uri.to_s
end

def google_state_cookie(state)
  "#{GOOGLE_STATE_COOKIE}=#{state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=#{GOOGLE_STATE_MAX_AGE}"
end

def clear_google_state_cookie
  "#{GOOGLE_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
end

def redirect_response(response, location)
  response.status = 302
  response["Location"] = location
end

def redirect_auth_error(response, message)
  response["Set-Cookie"] = clear_google_state_cookie
  redirect_response(response, "/?authError=#{URI.encode_www_form_component(message)}")
end

def http_json_request(method, url, headers = {}, body = nil)
  uri = URI(url)
  request = method == "POST" ? Net::HTTP::Post.new(uri) : Net::HTTP::Get.new(uri)
  headers.each { |key, value| request[key] = value }
  request.body = body if body

  response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https", open_timeout: 12, read_timeout: 12) do |http|
    http.request(request)
  end

  payload = JSON.parse(response.body.to_s)
  unless response.is_a?(Net::HTTPSuccess)
    raise(payload["error_description"] || payload["error"] || "Google sign-in failed.")
  end
  payload
rescue JSON::ParserError
  raise "Google returned an unreadable response."
rescue Errno::ECONNREFUSED, SocketError, Net::OpenTimeout, Net::ReadTimeout
  raise "Google sign-in could not reach Google. Check outbound HTTPS from the server."
end

def exchange_google_code(code, request)
  http_json_request(
    "POST",
    GOOGLE_TOKEN_ENDPOINT,
    { "Content-Type" => "application/x-www-form-urlencoded" },
    URI.encode_www_form(
      code: code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: google_redirect_uri(request),
      grant_type: "authorization_code"
    )
  )
end

def fetch_google_profile(access_token)
  http_json_request(
    "GET",
    GOOGLE_USERINFO_ENDPOINT,
    { "Authorization" => "Bearer #{access_token}" }
  )
end

def google_profile_allowed?(email, hosted_domain)
  GOOGLE_ALLOWED_EMAILS.include?(email) ||
    (!hosted_domain.empty? && GOOGLE_ALLOWED_DOMAINS.include?(hosted_domain))
end

def google_user_from_profile(profile)
  email = profile.fetch("email", "").to_s.strip.downcase
  hosted_domain = profile.fetch("hd", "").to_s.strip.downcase
  verified = [true, "true", 1, "1"].include?(profile["email_verified"]) ||
    [true, "true", 1, "1"].include?(profile["verified_email"])

  raise "Google did not return a verified email address." if email.empty? || !verified
  raise "That Google account is not authorized for this workspace." unless google_profile_allowed?(email, hosted_domain)

  sub = profile.fetch("sub", "").to_s.strip
  {
    "sub" => "google:#{sub.empty? ? email : sub}",
    "email" => email,
    "name" => profile.fetch("name", "").to_s.strip.empty? ? email.split("@").first : profile.fetch("name", "").to_s.strip,
    "picture" => profile.fetch("picture", "").to_s.strip,
    "hostedDomain" => hosted_domain,
    "onboarded" => true,
    "signedInAt" => Time.now.utc.iso8601
  }
end

def authenticate_google_callback(request)
  raise "Google login is not configured for this workspace." unless google_login_configured?

  expected_state = request_cookies(request)[GOOGLE_STATE_COOKIE].to_s
  actual_state = request.query["state"].to_s
  raise "Google sign-in expired. Try again." if expected_state.empty? || actual_state.empty? || !secure_compare(expected_state, actual_state)
  raise "Google sign-in was canceled or denied." if present?(request.query["error"])

  code = request.query["code"].to_s.strip
  raise "Google did not return a sign-in code." if code.empty?

  token = exchange_google_code(code, request)
  access_token = token.fetch("access_token", "").to_s.strip
  raise "Google did not return an access token." if access_token.empty?

  google_user_from_profile(fetch_google_profile(access_token))
end

def authenticate_user(email, password)
  raise "Authentication is not configured. Set AUTH_EMAIL and AUTH_PASSWORD before starting the server." unless password_login_configured?

  normalized_email = email.to_s.strip.downcase
  password_value = password.to_s

  demo_credentials = DEMO_LOGIN_ENABLED &&
    secure_compare(normalized_email, DEFAULT_AUTH_EMAIL) &&
    secure_compare(password_value, DEFAULT_AUTH_PASSWORD)
  valid_email = secure_compare(normalized_email, AUTH_EMAIL)
  valid_password = secure_compare(password_value, AUTH_PASSWORD)
  if demo_credentials
    valid_email = true
    valid_password = true
  end
  raise "Email or password is incorrect." unless valid_email && valid_password

  signed_in_email = demo_credentials ? DEFAULT_AUTH_EMAIL : AUTH_EMAIL
  signed_in_name = demo_credentials ? "GiftFlow Demo" : (AUTH_NAME.empty? ? AUTH_EMAIL.split("@").first : AUTH_NAME)
  {
    "sub" => "local-auth:#{signed_in_email}",
    "email" => signed_in_email,
    "name" => signed_in_name,
    "picture" => "",
    "hostedDomain" => "",
    "onboarded" => demo_credentials,
    "signedInAt" => Time.now.utc.iso8601
  }
end

def require_user(request, response)
  user = current_user(request)
  return user if user

  json_response(response, { ok: false, errors: ["Sign in to continue."] }, 401)
  nil
end

def gift_idea_admin?(user)
  !!(user && GIFT_IDEA_ADMIN_EMAILS.include?(user.fetch("email", "").to_s.strip.downcase))
end

def require_gift_idea_admin(request, response)
  user = require_user(request, response)
  return nil unless user
  return user if gift_idea_admin?(user)

  json_response(response, { ok: false, errors: ["You are not authorized to edit gift suggestions."] }, 403)
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
  user = current_user(request)
  password_login_configured = password_login_configured?
  google_login_configured = google_login_configured?
  json_response(response, {
    ok: true,
    configured: password_login_configured || google_login_configured,
    authMode: google_login_configured ? "google" : "password",
    passwordLoginEnabled: password_login_configured,
    googleLoginEnabled: google_login_configured,
    demoLoginEnabled: DEMO_LOGIN_ENABLED,
    usingDefaultCredentials: USING_DEFAULT_CREDENTIALS,
    user: user,
    permissions: {
      giftIdeaAdmin: gift_idea_admin?(user)
    }
  })
end

server.mount_proc("/api/auth/google/start") do |request, response|
  unless google_login_configured?
    redirect_auth_error(response, "Google login is not configured yet.")
    next
  end

  state = base64url_encode(SecureRandom.random_bytes(32))
  response["Set-Cookie"] = google_state_cookie(state)
  redirect_response(response, google_authorization_url(state, request))
end

server.mount_proc("/api/auth/google/callback") do |request, response|
  begin
    user = authenticate_google_callback(request)
    response["Set-Cookie"] = [clear_google_state_cookie, session_cookie(user)]
    redirect_response(response, "/")
  rescue StandardError => error
    redirect_auth_error(response, error.message)
  end
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

server.mount_proc("/api/gift-ideas") do |request, response|
  if request.request_method == "GET"
    json_response(response, { ok: true, ideas: read_gift_ideas })
    next
  end

  unless %w[POST PUT].include?(request.request_method)
    json_response(response, { ok: false, errors: ["Method not allowed."] }, 405)
    next
  end

  next unless require_gift_idea_admin(request, response)

  begin
    payload = JSON.parse(request.body.to_s)
    ideas = payload.fetch("ideas")
    raise "Ideas must be an array." unless ideas.is_a?(Array)

    json_response(response, { ok: true, ideas: write_gift_ideas(ideas) })
  rescue JSON::ParserError
    json_response(response, { ok: false, errors: ["Request body must be valid JSON."] }, 400)
  rescue KeyError => error
    json_response(response, { ok: false, errors: ["Missing required field: #{error.key}"] }, 422)
  rescue StandardError => error
    json_response(response, { ok: false, errors: [error.message] }, 422)
  end
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
