use rocket::{launch, Build, Rocket, fs::FileServer, fairing::{Fairing, Info, Kind}};
use rocket_db_pools::{Database, Connection};
use rocket_dyn_templates::Template;

mod auth;
mod cache;
mod config;
mod db;
mod email;
mod errors;
mod geocoding;
mod jobs;
mod models;
mod routes;
mod security;
mod storage;
mod worker;

/// Custom template filter registration
use std::collections::HashMap;

fn register_template_filters(engines: &mut rocket_dyn_templates::Engines) {
    use rocket_dyn_templates::tera::{Value, Error};
    use chrono::NaiveTime;
    
    let tera = &mut engines.tera;
    
    // Register event type filters
    let event_icon_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let event_type = value.as_str().unwrap_or("");
        let icon = match event_type {
            "profile_created" => "👤",
            "profile_updated" => "✏️",
            "profile_deactivated" => "🚫",
            "profile_reactivated" => "✅",
            "dog_added" => "🐕",
            "dog_updated" => "📝",
            "dog_deactivated" => "🐕‍🦺",
            "dog_reactivated" => "🦮",
            "dog_retired" => "🎖️",
            "shift_joined" => "📅",
            "shift_confirmed" => "✓",
            "shift_cancelled" => "❌",
            "waitlist_joined" => "⏳",
            "waitlist_promoted" => "🎉",
            "waitlist_declined" => "👎",
            "feedback_submitted" => "📝",
            "feedback_received" => "💬",
            "contacted_by_admin" => "📧",
            "note_added" => "📌",
            "shift_invited" => "✉️",
            "shift_invite_accepted" => "✅",
            "shift_invite_declined" => "❌",
            "shift_created" => "🆕",
            "shift_updated" => "📝",
            "shift_published" => "📢",
            "shift_archived" => "📥",
            "contact_added" => "👤",
            "shift_change_requested" => "🔄",
            "shift_change_approved" => "✅",
            "shift_change_rejected" => "❌",
            "vol_application_started" => "📋",
            "vol_application_submitted" => "📨",
            "vol_application_under_review" => "🔍",
            "vol_application_pending_vsc" => "🔒",
            "vol_application_pending_background" => "🔒",
            "vol_application_pending_assessment" => "📝",
            "vol_application_assessment_scheduled" => "📅",
            "vol_application_approved" => "🎉",
            "vol_application_rejected" => "❌",
            "vol_application_withdrawn" => "🚪",
            "invite_link_created" => "🔗",
            _ => "•",
        };
        Ok(Value::String(icon.to_string()))
    };
    
    let event_label_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let event_type = value.as_str().unwrap_or("");
        let label = match event_type {
            "profile_created" => "Profile Created",
            "profile_updated" => "Profile Updated",
            "profile_deactivated" => "Account Deactivated",
            "profile_reactivated" => "Account Reactivated",
            "dog_added" => "Dog Added",
            "dog_updated" => "Dog Updated",
            "dog_deactivated" => "Dog Deactivated",
            "dog_reactivated" => "Dog Reactivated",
            "dog_retired" => "Dog Retired",
            "shift_joined" => "Joined Shift",
            "shift_confirmed" => "Shift Confirmed",
            "shift_cancelled" => "Cancelled Shift",
            "waitlist_joined" => "Joined Waitlist",
            "waitlist_promoted" => "Promoted from Waitlist",
            "waitlist_declined" => "Declined Promotion",
            "feedback_submitted" => "Feedback Submitted",
            "feedback_received" => "Feedback Received",
            "contacted_by_admin" => "Contacted by Admin",
            "note_added" => "Note Added",
            "shift_invited" => "Shift Invited",
            "shift_invite_accepted" => "Invite Accepted",
            "shift_invite_declined" => "Invite Declined",
            "shift_created" => "Shift Created",
            "shift_updated" => "Shift Updated",
            "shift_published" => "Shift Published",
            "shift_archived" => "Shift Archived",
            "contact_added" => "Agency Contact Added",
            "shift_change_requested" => "Change Requested",
            "shift_change_approved" => "Change Approved",
            "shift_change_rejected" => "Change Rejected",
            "vol_application_started" => "Application Started",
            "vol_application_submitted" => "Application Submitted",
            "vol_application_under_review" => "Under Review",
            "vol_application_pending_vsc" => "Pending VSC",
            "vol_application_pending_background" => "Pending Background Check",
            "vol_application_pending_assessment" => "Pending Assessment",
            "vol_application_assessment_scheduled" => "Assessment Scheduled",
            "vol_application_approved" => "Application Approved",
            "vol_application_rejected" => "Application Rejected",
            "vol_application_withdrawn" => "Application Withdrawn",
            "invite_link_created" => "Invite Link Created",
            _ => event_type,
        };
        Ok(Value::String(label.to_string()))
    };
    
    let event_color_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let event_type = value.as_str().unwrap_or("");
        let class = match event_type {
            "profile_created" => "bg-blue-100 text-blue-700 border-blue-200",
            "profile_updated" => "bg-gray-100 text-gray-700 border-gray-200",
            "profile_deactivated" => "bg-red-100 text-red-700 border-red-200",
            "profile_reactivated" => "bg-green-100 text-green-700 border-green-200",
            "dog_added" => "bg-amber-100 text-amber-700 border-amber-200",
            "dog_updated" => "bg-amber-50 text-amber-600 border-amber-100",
            "dog_deactivated" => "bg-orange-100 text-orange-700 border-orange-200",
            "dog_reactivated" => "bg-lime-100 text-lime-700 border-lime-200",
            "dog_retired" => "bg-orange-100 text-orange-700 border-orange-200",
            "shift_joined" | "shift_confirmed" => "bg-indigo-100 text-indigo-700 border-indigo-200",
            "shift_cancelled" => "bg-rose-100 text-rose-700 border-rose-200",
            "waitlist_joined" => "bg-yellow-100 text-yellow-700 border-yellow-200",
            "waitlist_promoted" => "bg-emerald-100 text-emerald-700 border-emerald-200",
            "waitlist_declined" => "bg-stone-100 text-stone-700 border-stone-200",
            "feedback_submitted" => "bg-purple-100 text-purple-700 border-purple-200",
            "feedback_received" => "bg-pink-100 text-pink-700 border-pink-200",
            "contacted_by_admin" => "bg-cyan-100 text-cyan-700 border-cyan-200",
            "note_added" => "bg-teal-100 text-teal-700 border-teal-200",
            "shift_invited" => "bg-blue-100 text-blue-700 border-blue-200",
            "shift_invite_accepted" => "bg-green-100 text-green-700 border-green-200",
            "shift_invite_declined" => "bg-rose-100 text-rose-700 border-rose-200",
            "shift_created" => "bg-indigo-100 text-indigo-700 border-indigo-200",
            "shift_updated" => "bg-amber-100 text-amber-700 border-amber-200",
            "shift_published" => "bg-green-100 text-green-700 border-green-200",
            "shift_archived" => "bg-gray-100 text-gray-700 border-gray-200",
            "contact_added" => "bg-blue-100 text-blue-700 border-blue-200",
            "shift_change_requested" => "bg-amber-100 text-amber-700 border-amber-200",
            "shift_change_approved" => "bg-green-100 text-green-700 border-green-200",
            "shift_change_rejected" => "bg-rose-100 text-rose-700 border-rose-200",
            "vol_application_started" => "bg-blue-100 text-blue-700 border-blue-200",
            "vol_application_submitted" => "bg-indigo-100 text-indigo-700 border-indigo-200",
            "vol_application_under_review" => "bg-yellow-100 text-yellow-700 border-yellow-200",
            "vol_application_pending_vsc" | "vol_application_pending_background" => "bg-amber-100 text-amber-700 border-amber-200",
            "vol_application_pending_assessment" => "bg-orange-100 text-orange-700 border-orange-200",
            "vol_application_assessment_scheduled" => "bg-purple-100 text-purple-700 border-purple-200",
            "vol_application_approved" => "bg-green-100 text-green-700 border-green-200",
            "vol_application_rejected" => "bg-red-100 text-red-700 border-red-200",
            "vol_application_withdrawn" => "bg-gray-100 text-gray-500 border-gray-200",
            "invite_link_created" => "bg-cyan-100 text-cyan-700 border-cyan-200",
            _ => "bg-gray-100 text-gray-700 border-gray-200",
        };
        Ok(Value::String(class.to_string()))
    };
    
    tera.register_filter("event_icon", event_icon_filter);
    tera.register_filter("event_label", event_label_filter);
    tera.register_filter("event_color", event_color_filter);
    
    // Field name mapping for history logs
    let field_name_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let field = value.as_str().unwrap_or("");
        let label = match field {
            "title" => "Title",
            "description" => "Description",
            "site" | "site_id" => "Location/Site",
            "contact" | "contact_id" => "Designated Contact",
            "start_time" | "start_at" => "Start Time",
            "end_time" | "end_at" => "End Time",
            "slots" | "slots_requested" => "Team Count",
            "state" => "Status",
            "parking_notes" => "Parking Details",
            "meeting_notes" => "Meeting Notes",
            "specific_requests" => "Specific Requests",
            "requires_police_check" => "Police Check Requirement",
            "requires_vulnerable_check" => "Vulnerable Sector Check",
            _ => field,
        };
        Ok(Value::String(label.to_string()))
    };
    tera.register_filter("field_name", field_name_filter);

    // Human-readable event descriptions
    let event_description_filter = |value: &Value, args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let event_type = value.as_str().unwrap_or("");
        let metadata = args.get("metadata").and_then(|m| m.as_object());
        
        let desc = match event_type {
            "profile_created" => "Created their volunteer profile.".to_string(),
            "profile_updated" => {
                if let Some(m) = metadata {
                    if let Some(fields) = m.get("changed_fields").and_then(|f| f.as_array()) {
                        let field_names: Vec<String> = fields.iter()
                            .filter_map(|f| f.as_str())
                            .map(|f| match f {
                                "volunteer_names" => "Name",
                                "bio" => "Bio",
                                "joined_at" => "Start Date",
                                _ => f
                            }.to_string())
                            .collect();
                        format!("Updated their profile ({}).", field_names.join(", "))
                    } else {
                        "Updated their profile details.".to_string()
                    }
                } else {
                    "Updated their profile.".to_string()
                }
            },
            "profile_deactivated" => "Deactivated their volunteer account.".to_string(),
            "profile_reactivated" => "Reactivated their volunteer account.".to_string(),
            "dog_added" => {
                let name = metadata.and_then(|m| m.get("dog_name")).and_then(|n| n.as_str()).unwrap_or("a new dog");
                format!("Registered {} to the program.", name)
            },
            "dog_updated" => {
                let name = metadata.and_then(|m| m.get("dog_name")).and_then(|n| n.as_str()).unwrap_or("their dog");
                format!("Updated information for {}.", name)
            },
            "dog_deactivated" => {
                let name = metadata.and_then(|m| m.get("dog_name")).and_then(|n| n.as_str()).unwrap_or("their dog");
                format!("Paused participation for {}.", name)
            },
            "dog_reactivated" => {
                let name = metadata.and_then(|m| m.get("dog_name")).and_then(|n| n.as_str()).unwrap_or("their dog");
                format!("Reactivated {} for therapy visits.", name)
            },
            "dog_retired" => {
                let name = metadata.and_then(|m| m.get("dog_name")).and_then(|n| n.as_str()).unwrap_or("their dog");
                let reason = metadata.and_then(|m| m.get("reason")).and_then(|r| r.as_str()).unwrap_or("personal reasons");
                let note = metadata.and_then(|m| m.get("note")).and_then(|n| n.as_str()).unwrap_or("");
                
                let reason_label = match reason {
                    "aging_out" => "aging out of program",
                    "health_issues" => "health issues",
                    "behavioral_changes" => "behavioral changes",
                    "relocation" => "relocation",
                    "personal_reasons" => "personal reasons",
                    "deceased" => "passing away 🌈",
                    _ => reason
                };

                if note.is_empty() {
                    format!("Retired {} from the program due to {}.", name, reason_label)
                } else {
                    format!("Retired {} from the program due to {} ({}).", name, reason_label, note)
                }
            },
            "shift_joined" => {
                let agency = metadata.and_then(|m| m.get("agency_name")).and_then(|n| n.as_str()).unwrap_or("an agency");
                let title = metadata.and_then(|m| m.get("shift_title")).and_then(|n| n.as_str()).unwrap_or("a shift");
                format!("Signed up for a visit to {} ({}).", agency, title)
            },
            "waitlist_joined" => {
                let agency = metadata.and_then(|m| m.get("agency_name")).and_then(|n| n.as_str()).unwrap_or("an agency");
                format!("Joined the waitlist for a visit to {}.", agency)
            },
            "shift_cancelled" => {
                let agency = metadata.and_then(|m| m.get("agency_name")).and_then(|n| n.as_str()).unwrap_or("an agency");
                format!("Cancelled their participation in a visit to {}.", agency)
            },
            "shift_invite_accepted" => "Accepted an invitation to a visit.".to_string(),
            "shift_invite_declined" => "Declined an invitation to a visit.".to_string(),
            "dog_application_submitted" => "Submitted a new dog registration application.".to_string(),
            "dog_application_approved" => "Dog application was approved! 🎉".to_string(),
            "dog_application_rejected" => "Dog application was declined.".to_string(),
            "assessment_scheduled" => "Scheduled an in-person assessment.".to_string(),
            "assessment_attended" => "Completed their in-person assessment.".to_string(),
            "assessment_no_show" => "Did not attend their scheduled assessment.".to_string(),
            "feedback_submitted" => {
                let title = metadata.and_then(|m| m.get("shift_title")).and_then(|n| n.as_str()).unwrap_or("a shift");
                let rating = metadata.and_then(|m| m.get("rating")).and_then(|r| r.as_i64()).unwrap_or(0);
                if rating > 0 {
                    format!("Submitted a {}-star report for {}.", rating, title)
                } else {
                    format!("Submitted a post-shift report for {}.", title)
                }
            },
            "feedback_received" => {
                let from = metadata.and_then(|m| m.get("from_volunteer_name")).and_then(|n| n.as_str()).unwrap_or("a teammate");
                format!("Received kudos from {}.", from)
            },
            "vol_application_started" => "Started a volunteer application.".to_string(),
            "vol_application_submitted" => "Submitted their volunteer application for review.".to_string(),
            "vol_application_under_review" => "Application moved to under review.".to_string(),
            "vol_application_pending_vsc" => "Application awaiting VSC clearance.".to_string(),
            "vol_application_pending_background" => "Application awaiting background check.".to_string(),
            "vol_application_pending_assessment" => "Application pending assessment scheduling.".to_string(),
            "vol_application_assessment_scheduled" => "Assessment has been scheduled.".to_string(),
            "vol_application_approved" => "Volunteer application approved! 🎉".to_string(),
            "vol_application_rejected" => {
                let reason = metadata.and_then(|m| m.get("reason")).and_then(|r| r.as_str()).unwrap_or("");
                if reason.is_empty() {
                    "Volunteer application was rejected.".to_string()
                } else {
                    format!("Volunteer application was rejected: {}", reason)
                }
            },
            "vol_application_withdrawn" => "Withdrew their volunteer application.".to_string(),
            "invite_link_created" => {
                let label = metadata.and_then(|m| m.get("label")).and_then(|l| l.as_str()).unwrap_or("an invite link");
                format!("Created invite link: {}.", label)
            },
            _ => event_type.replace('_', " ").to_string()
        };
        Ok(Value::String(desc))
    };
    tera.register_filter("event_description", event_description_filter);
    
    // Application status filters
    let app_status_color_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let status = value.as_str().unwrap_or("");
        let class = match status {
            "draft" => "bg-gray-100 text-gray-700",
            "submitted" => "bg-blue-100 text-blue-700",
            "under_review" => "bg-yellow-100 text-yellow-700",
            "pending_assessment" => "bg-orange-100 text-orange-700",
            "assessment_scheduled" => "bg-purple-100 text-purple-700",
            "assessment_completed" => "bg-indigo-100 text-indigo-700",
            "approved" => "bg-green-100 text-green-700",
            "rejected" => "bg-red-100 text-red-700",
            "withdrawn" => "bg-gray-100 text-gray-500",
            _ => "bg-gray-100 text-gray-700",
        };
        Ok(Value::String(class.to_string()))
    };
    
    let app_status_label_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let status = value.as_str().unwrap_or("");
        let label = match status {
            "draft" => "Draft",
            "submitted" => "Pending Review",
            "under_review" => "Under Review",
            "pending_assessment" => "Pending Assessment",
            "assessment_scheduled" => "Assessment Scheduled",
            "assessment_completed" => "Assessment Completed",
            "approved" => "Approved",
            "rejected" => "Rejected",
            "withdrawn" => "Withdrawn",
            _ => status,
        };
        Ok(Value::String(label.to_string()))
    };
    
    tera.register_filter("app_status_color", app_status_color_filter);
    tera.register_filter("app_status_label", app_status_label_filter);

    // Volunteer application status filters (same logic, aliased name for template clarity)
    let vol_app_status_color_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let status = value.as_str().unwrap_or("");
        let class = match status {
            "draft" | "started" => "bg-gray-100 text-gray-700",
            "submitted" => "bg-blue-100 text-blue-700",
            "under_review" => "bg-yellow-100 text-yellow-700",
            "pending_vsc" => "bg-amber-100 text-amber-700",
            "pending_background_check" => "bg-amber-100 text-amber-700",
            "pending_assessment" => "bg-orange-100 text-orange-700",
            "assessment_scheduled" => "bg-purple-100 text-purple-700",
            "approved" => "bg-green-100 text-green-700",
            "rejected" => "bg-red-100 text-red-700",
            "withdrawn" => "bg-gray-100 text-gray-500",
            _ => "bg-gray-100 text-gray-700",
        };
        Ok(Value::String(class.to_string()))
    };

    let vol_app_status_label_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let status = value.as_str().unwrap_or("");
        let label = match status {
            "draft" | "started" => "Draft",
            "submitted" => "Pending Review",
            "under_review" => "Under Review",
            "pending_vsc" => "Pending VSC",
            "pending_background_check" => "Pending Background Check",
            "pending_assessment" => "Pending Assessment",
            "assessment_scheduled" => "Assessment Scheduled",
            "approved" => "Approved",
            "rejected" => "Rejected",
            "withdrawn" => "Withdrawn",
            _ => status,
        };
        Ok(Value::String(label.to_string()))
    };

    tera.register_filter("vol_app_status_color", vol_app_status_color_filter);
    tera.register_filter("vol_app_status_label", vol_app_status_label_filter);

    // Boolean yes/no filter
    let yesno_filter = |value: &Value, args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let yes = args.get("yes").and_then(|v| v.as_str()).unwrap_or("Yes");
        let no = args.get("no").and_then(|v| v.as_str()).unwrap_or("No");
        let b = value.as_bool().unwrap_or(false);
        Ok(Value::String(if b { yes } else { no }.to_string()))
    };
    tera.register_filter("yesno", yesno_filter);

    // JSON decode filter
    let json_decode_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let s = value.as_str().ok_or_else(|| Error::msg("json_decode: value must be a string"))?;
        serde_json::from_str(s).map_err(|e| Error::msg(format!("json_decode failed: {}", e)))
    };
    tera.register_filter("json_decode", json_decode_filter);

    // Time formatting filter
    let time_filter = |value: &Value, args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        let time_format = match args.get("format") {
            Some(f) => f.as_str().unwrap_or("%-I:%M %p"),
            None => "%-I:%M %p",
        };

        if let Some(s) = value.as_str() {
            // Attempt multiple formats
            if let Ok(t) = chrono::NaiveTime::parse_from_str(s, "%H:%M:%S") {
                return Ok(Value::String(t.format(time_format).to_string()));
            }
            if let Ok(t) = chrono::NaiveTime::parse_from_str(s, "%H:%M") {
                return Ok(Value::String(t.format(time_format).to_string()));
            }
        }
        
        Ok(value.clone())
    };
    tera.register_filter("time", time_filter);

    // Date formatting filter (handles Null and multiple formats)
    let date_filter = |value: &Value, args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        if value.is_null() {
            return Ok(Value::String("".to_string()));
        }

        let date_format = match args.get("format") {
            Some(f) => f.as_str().unwrap_or("%Y-%m-%d"),
            None => "%Y-%m-%d",
        };

        if let Some(s) = value.as_str() {
            // ISO Date (2024-03-05)
            if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                return Ok(Value::String(d.format(date_format).to_string()));
            }
            // ISO DateTime
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Ok(Value::String(dt.format(date_format).to_string()));
            }
            // Naive DateTime
            if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                return Ok(Value::String(dt.format(date_format).to_string()));
            }
        }
        
        Ok(value.clone())
    };
    tera.register_filter("date", date_filter);

    // Filter to check if a date string/datetime is in the past (with optional offset)
    let past_filter = |value: &Value, args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        if value.is_null() {
            return Ok(Value::Bool(false));
        }

        let hours = args.get("hours").and_then(|v| v.as_i64()).unwrap_or(0);
        let now = chrono::Utc::now();
        let threshold = now + chrono::Duration::hours(hours);

        let is_past = if let Some(s) = value.as_str() {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                dt.with_timezone(&chrono::Utc) < threshold
            } else if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                d < threshold.date_naive()
            } else if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                dt < threshold.naive_utc()
            } else {
                false
            }
        } else {
            false
        };

        Ok(Value::Bool(is_past))
    };
    tera.register_filter("past", past_filter);

    // badge_initial: returns the best single letter for a user avatar badge.
    // If the name begins with a known honorific prefix (Dr., Mr., Mrs., etc.)
    // the initial of the last word is used instead of the prefix.
    let badge_initial_filter = |value: &Value, _args: &HashMap<String, Value>| -> std::result::Result<Value, Error> {
        const PREFIXES: &[&str] = &[
            "dr.", "mr.", "mrs.", "ms.", "miss.", "prof.", "rev.", "hon.",
            "sr.", "jr.", "mx.", "cpl.", "sgt.", "lt.", "col.", "gen.",
        ];
        let name = value.as_str().unwrap_or("").trim();
        let words: Vec<&str> = name.split_whitespace().collect();
        let initial = if words.len() > 1 && PREFIXES.contains(&words[0].to_lowercase().as_str()) {
            // Has a prefix — use the last word's first char
            words.last().and_then(|w| w.chars().next())
        } else {
            // No prefix — use the first word's first char as usual
            words.first().and_then(|w| w.chars().next())
        };
        let ch = initial
            .map(|c| c.to_uppercase().to_string())
            .unwrap_or_else(|| "?".to_string());
        Ok(Value::String(ch))
    };
    tera.register_filter("badge_initial", badge_initial_filter);
}

#[derive(Database)]
#[database("sunshine_db")]
pub struct Db(sqlx::PgPool);

struct StartupMessageFairing;

#[rocket::async_trait]
impl Fairing for StartupMessageFairing {
    fn info(&self) -> Info {
        Info {
            name: "Startup Message",
            kind: Kind::Liftoff,
        }
    }

    async fn on_liftoff(&self, rocket: &Rocket<rocket::Orbit>) {
        let cfg = rocket.state::<config::AppConfig>().unwrap();
        let db = rocket.state::<Db>().unwrap();
        
        println!("\n\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
        println!("┃ ☀️ SUNSHINE VOLUNTEERS — SERVER LAUNCHED                                    ┃");
        println!("┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫");
        println!("┃ ENVIRONMENT: {:<62} ┃", format!("{:?}", cfg.environment).to_uppercase());
        println!("┃ URL:         {:<62} ┃", cfg.app_url);
        
        if cfg.environment.is_dev() {
            println!("┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫");
            println!("┃ 🛠️  DEVELOPMENT QUICK LINKS (Instant Login)                                 ┃");
            println!("┃                                                                             ┃");
            println!("┃ SUPER ADMIN: {:<62} ┃", format!("{}/auth/dev-login?role=super_admin", cfg.app_url));
            println!("┃ ADMIN:       {:<62} ┃", format!("{}/auth/dev-login?role=admin", cfg.app_url));
            println!("┃ VOLUNTEER:   {:<62} ┃", format!("{}/auth/dev-login?role=volunteer", cfg.app_url));
            println!("┃ AGENCY:      {:<62} ┃", format!("{}/auth/dev-login?role=agency", cfg.app_url));
        } else {
            // Check if super admin exists
            let has_super: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' AND is_active = true)")
                .fetch_one(&db.0)
                .await
                .unwrap_or(false);

            if !has_super {
                // Generate one-time setup token
                let token = uuid::Uuid::new_v4().to_string();
                let expires = chrono::Utc::now() + chrono::Duration::hours(1);
                
                let _ = sqlx::query("INSERT INTO one_time_tokens (token, purpose, expires_at) VALUES ($1, 'super_admin_setup', $2)")
                    .bind(&token)
                    .bind(expires)
                    .execute(&db.0)
                    .await;

                println!("┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫");
                println!("┃ 🚨 FIRST-TIME SETUP REQUIRED                                                ┃");
                println!("┃                                                                             ┃");
                println!("┃ Use the following one-time link to create your Super Admin account:         ┃");
                println!("┃ {:<75} ┃", format!("{}/auth/setup/{}", cfg.app_url, token));
                println!("┃ (Link expires in 1 hour)                                                    ┃");
            }
        }
        println!("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n");
    }
}

#[launch]
fn rocket() -> Rocket<Build> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_ansi(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("sunshine=debug".parse().unwrap())
                .add_directive("rocket=info".parse().unwrap()),
        )
        .init();

    let mut cfg = config::AppConfig::from_env().expect("Failed to load app config");

    let figment = rocket::Config::figment();

    // In dev builds, scan forward for a free port rather than aborting.
    // In release builds, keep Rocket's default behaviour (hard error on conflict).
    #[cfg(any(debug_assertions, feature = "dev-routes"))]
    let (figment, actual_port) = {
        let base_port: u16 = figment
            .extract_inner("port")
            .unwrap_or(8000u16);
        let port = find_free_port(base_port);
        if port != base_port {
            tracing::warn!(
                "Port {} is in use — binding to {} instead",
                base_port,
                port
            );
        }
        (figment.merge(("port", port)), port)
    };

    #[cfg(not(any(debug_assertions, feature = "dev-routes")))]
    let (figment, actual_port) = {
        let port: u16 = figment.extract_inner("port").unwrap_or(8000u16);
        (figment, port)
    };

    // If we are in development and app_url points to localhost, update it with the actual port
    if cfg.environment == config::Environment::Development {
        if let Ok(mut url) = url::Url::parse(&cfg.app_url) {
            if let Some(host) = url.host_str() {
                if host == "localhost" || host == "127.0.0.1" {
                    let _ = url.set_port(Some(actual_port));
                    cfg.app_url = url.to_string().trim_end_matches('/').to_string();
                }
            }
        }
    }

    let email_svc = email::EmailService::new(&cfg);
    let storage = storage::StorageBackend::from_config(&cfg);

    // Build ClerkAuth (always created; if no PK the JWKS URL is empty and auth is disabled)
    let clerk_jwks_url = cfg
        .clerk_publishable_key
        .as_deref()
        .and_then(|pk| auth::clerk::ClerkAuth::jwks_url_from_publishable_key(pk))
        .unwrap_or_default();
    let clerk_auth = auth::clerk::ClerkAuth::new(clerk_jwks_url);

    // Derive Clerk JS URL for base template
    let clerk_pk_for_template = cfg.clerk_publishable_key.clone();
    let clerk_js_url_for_template = cfg
        .clerk_publishable_key
        .as_deref()
        .and_then(|pk| auth::clerk::ClerkAuth::js_url_from_publishable_key(pk))
        .unwrap_or_default();

    // Build WebAuthn instance (RP ID = hostname, origin = full URL)
    let rp_id = cfg
        .app_url
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split(':')
        .next()
        .unwrap_or("localhost")
        .to_string();

    let webauthn = auth::passkey::build_webauthn(&rp_id, &cfg.app_url)
        .expect("Failed to build WebAuthn instance");

    rocket::custom(figment)
        .attach(Db::init())
        .attach(db::MigrationsFairing)
        .attach(StartupMessageFairing)
        .attach(Template::custom(move |engines| {
            register_template_filters(engines);
            // Register clerk_publishable_key() as a global Tera function
            let pk = clerk_pk_for_template.clone();
            engines.tera.register_function(
                "clerk_publishable_key",
                move |_args: &std::collections::HashMap<
                    String,
                    rocket_dyn_templates::tera::Value,
                >| {
                    Ok(match &pk {
                        Some(k) => rocket_dyn_templates::tera::Value::String(k.clone()),
                        None => rocket_dyn_templates::tera::Value::Null,
                    })
                },
            );
            // Register clerk_js_url() as a global Tera function
            let js_url = clerk_js_url_for_template.clone();
            engines.tera.register_function(
                "clerk_js_url",
                move |_args: &std::collections::HashMap<
                    String,
                    rocket_dyn_templates::tera::Value,
                >| {
                    Ok(if js_url.is_empty() {
                        rocket_dyn_templates::tera::Value::Null
                    } else {
                        rocket_dyn_templates::tera::Value::String(js_url.clone())
                    })
                },
            );
        }))
        .attach(security::SecurityHeaders)
        .attach(cache::CacheHeaders::new())
        .attach(auth::impersonate::ImpersonationBanner)
        .attach(jobs::SurveyTriggerFairing)
        .attach(jobs::CalendarRefreshFairing)
        .attach(worker::WorkerFairing)
        .manage(cfg)
        .manage(email_svc)
        .manage(auth::passkey::WebauthnState(webauthn))
        .manage(storage)
        .manage(clerk_auth)
        .manage(routes::auth::MagicLinkRateLimiter::new())
        .register("/", errors::catchers())
        .mount("/static", FileServer::from("static").rank(1))
        .mount("/", routes::public::routes())
        .mount("/", routes::gallery::routes())
        .mount("/auth", routes::auth::routes())
        .mount("/volunteer", routes::volunteer::routes())
        .mount("/admin", routes::admin::routes())
        .mount("/admin", routes::system::routes())
        .mount("/agency", routes::agency::routes())
        .mount("/apply", routes::apply::routes())
        .mount("/api", routes::api::routes())
        .mount("/api/v1", routes::api_v1::routes())
        .mount("/calendar", routes::calendar::routes())
}

/// Try each port from `start` upward until one is free (dev only).
#[cfg(any(debug_assertions, feature = "dev-routes"))]
fn find_free_port(start: u16) -> u16 {
    use std::net::TcpListener;
    (start..start.saturating_add(20))
        .find(|&p| TcpListener::bind(("127.0.0.1", p)).is_ok())
        .unwrap_or(start)
}
