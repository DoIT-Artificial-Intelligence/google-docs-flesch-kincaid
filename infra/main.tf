# Usage logging for the Docs add-on: Apps Script streams rewrite/accept events
# into BigQuery as a dedicated service account. See README "Usage logging".
#
# The service account key is NOT managed here (it would land in state in
# plain text). Create it with gcloud and paste it into the Apps Script
# script property BQ_SERVICE_ACCOUNT_KEY; see the README.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

variable "project" {
  type    = string
  default = "adept-figure-493916-r5"
}

provider "google" {
  project = var.project
}

resource "google_bigquery_dataset" "usage" {
  dataset_id  = "docs_addon_usage"
  location    = "US"
  description = "Usage logs for the Flesch-Kincaid / plain language Google Docs add-on"
}

resource "google_bigquery_table" "rewrite_events" {
  dataset_id          = google_bigquery_dataset.usage.dataset_id
  table_id            = "rewrite_events"
  description         = "Raw rewrite/accept events from the Docs add-on"
  deletion_protection = true
  schema              = file("${path.module}/rewrite_events_schema.json")

  time_partitioning {
    type  = "DAY"
    field = "time"
  }
}

# One row per AI rewrite, with accepted = whether an accept event exists.
# Streaming inserts cannot be updated right away, so acceptance is a
# separate event joined here instead of an UPDATE.
resource "google_bigquery_table" "rewrites" {
  dataset_id          = google_bigquery_dataset.usage.dataset_id
  table_id            = "rewrites"
  description         = "One row per AI rewrite: user, time, sentence, rewrite, accepted, tokens, cost"
  deletion_protection = false

  view {
    use_legacy_sql = false
    query          = <<-SQL
      SELECT
        r.user, r.time, r.sentence, r.rewrite,
        a.rewrite_id IS NOT NULL AS accepted,
        r.tokens, r.cost,
        r.user_key, r.input_tokens, r.output_tokens, r.target_grade, r.rewrite_grade, r.same_meaning, r.model, r.rewrite_id
      FROM (
        SELECT * FROM `${var.project}.${google_bigquery_dataset.usage.dataset_id}.${google_bigquery_table.rewrite_events.table_id}`
        WHERE event = "rewrite"
        QUALIFY ROW_NUMBER() OVER (PARTITION BY rewrite_id ORDER BY time) = 1
      ) r
      LEFT JOIN (
        SELECT DISTINCT rewrite_id
        FROM `${var.project}.${google_bigquery_dataset.usage.dataset_id}.${google_bigquery_table.rewrite_events.table_id}`
        WHERE event = "accept"
      ) a USING (rewrite_id)
    SQL
  }
}

resource "google_service_account" "logger" {
  account_id   = "docs-addon-logger"
  display_name = "Docs add-on BigQuery logger"
  description  = "Used by the Docs add-on (Apps Script) to stream usage rows into docs_addon_usage"
}

# Write access to this one dataset only.
resource "google_bigquery_dataset_iam_member" "logger_writer" {
  dataset_id = google_bigquery_dataset.usage.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = "serviceAccount:${google_service_account.logger.email}"
}

output "service_account_email" {
  value = google_service_account.logger.email
}
