# These were created by hand (bq mk) before Terraform managed them.
import {
  to = google_bigquery_dataset.usage
  id = "projects/adept-figure-493916-r5/datasets/docs_addon_usage"
}
import {
  to = google_bigquery_table.rewrite_events
  id = "projects/adept-figure-493916-r5/datasets/docs_addon_usage/tables/rewrite_events"
}
import {
  to = google_bigquery_table.rewrites
  id = "projects/adept-figure-493916-r5/datasets/docs_addon_usage/tables/rewrites"
}
