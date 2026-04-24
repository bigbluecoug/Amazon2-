require "date"
require "json"
require "securerandom"
require "time"
require "webrick"

ROOT = File.expand_path(__dir__)
PUBLIC_ROOT = File.join(ROOT, "public")
PORT = Integer(ENV.fetch("PORT", "4174"))

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
  response["Content-Type"] = "application/json"
  response.body = JSON.pretty_generate({ ok: true, service: "gift-campaigns", port: PORT })
end

server.mount_proc("/api/orders/process") do |request, response|
  response["Content-Type"] = "application/json"

  begin
    payload = JSON.parse(request.body.to_s)
    state = payload.fetch("state")
    run_date = payload.fetch("runDate", Date.today.iso8601)
    response.body = JSON.pretty_generate(process_orders(state, run_date))
  rescue JSON::ParserError
    response.status = 400
    response.body = JSON.pretty_generate({ ok: false, errors: ["Request body must be valid JSON."] })
  rescue KeyError => error
    response.status = 422
    response.body = JSON.pretty_generate({ ok: false, errors: ["Missing required field: #{error.key}"] })
  rescue StandardError => error
    response.status = 500
    response.body = JSON.pretty_generate({ ok: false, errors: [error.message] })
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
