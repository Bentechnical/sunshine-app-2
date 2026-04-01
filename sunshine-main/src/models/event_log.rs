//! Event logging helper for volunteer activities

use crate::models::volunteer::VolunteerEventType;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use sqlx::FromRow;

/// Represents a version of a note/comment
#[derive(Debug, Clone, FromRow)]
pub struct NoteVersion {
    pub id: Uuid,
    pub entity_type: String,
    pub entity_id: Uuid,
    pub field_name: String,
    pub content: Option<String>,
    pub previous_version_id: Option<Uuid>,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    #[sqlx(default)]
    pub created_by_name: Option<String>,
}

/// Helper struct for logging volunteer events
pub struct EventLog;

impl EventLog {
    /// Log a volunteer event
    pub async fn log<'a, E>(
        executor: E,
        user_id: Uuid,
        event_type: VolunteerEventType,
        shift_id: Option<Uuid>,
        dog_id: Option<Uuid>,
        related_user_id: Option<Uuid>,
        metadata: serde_json::Value,
        created_by: Option<Uuid>,
    ) -> Result<Uuid, sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO volunteer_events 
                (user_id, event_type, shift_id, dog_id, related_user_id, metadata, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            "#,
        )
        .bind(user_id)
        .bind(event_type)
        .bind(shift_id)
        .bind(dog_id)
        .bind(related_user_id)
        .bind(metadata)
        .bind(created_by)
        .fetch_one(executor)
        .await?;

        Ok(id)
    }

    /// Log profile creation
    pub async fn profile_created<'a, E>(
        executor: E,
        user_id: Uuid,
        created_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ProfileCreated,
            None,
            None,
            None,
            serde_json::json!({}),
            created_by,
        )
        .await?;
        Ok(())
    }

    /// Log profile update
    pub async fn profile_updated<'a, E>(
        executor: E,
        user_id: Uuid,
        changed_fields: Vec<String>,
        changed_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "changed_fields": changed_fields
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ProfileUpdated,
            None,
            None,
            None,
            metadata,
            changed_by,
        )
        .await?;
        Ok(())
    }

    /// Log account deactivation
    pub async fn profile_deactivated<'a, E>(
        executor: E,
        user_id: Uuid,
        deactivated_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ProfileDeactivated,
            None,
            None,
            None,
            serde_json::json!({}),
            deactivated_by,
        )
        .await?;
        Ok(())
    }

    /// Log account reactivation
    pub async fn profile_reactivated<'a, E>(
        executor: E,
        user_id: Uuid,
        reactivated_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ProfileReactivated,
            None,
            None,
            None,
            serde_json::json!({}),
            reactivated_by,
        )
        .await?;
        Ok(())
    }

    /// Log dog added
    pub async fn dog_added<'a, E>(
        executor: E,
        user_id: Uuid,
        dog_id: Uuid,
        dog_name: &str,
        added_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogAdded,
            None,
            Some(dog_id),
            None,
            metadata,
            added_by,
        )
        .await?;
        Ok(())
    }

    /// Log dog updated
    pub async fn dog_updated<'a, E>(
        executor: E,
        user_id: Uuid,
        dog_id: Uuid,
        dog_name: &str,
        changed_fields: Vec<String>,
        updated_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "dog_name": dog_name,
            "changed_fields": changed_fields
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogUpdated,
            None,
            Some(dog_id),
            None,
            metadata,
            updated_by,
        )
        .await?;
        Ok(())
    }

    /// Log dog deactivated
    pub async fn dog_deactivated<'a, E>(
        executor: E,
        user_id: Uuid,
        dog_id: Uuid,
        dog_name: &str,
        deactivated_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogDeactivated,
            None,
            Some(dog_id),
            None,
            metadata,
            deactivated_by,
        )
        .await?;
        Ok(())
    }

    /// Log dog reactivated
    pub async fn dog_reactivated<'a, E>(
        executor: E,
        user_id: Uuid,
        dog_id: Uuid,
        dog_name: &str,
        reactivated_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogReactivated,
            None,
            Some(dog_id),
            None,
            metadata,
            reactivated_by,
        )
        .await?;
        Ok(())
    }

    /// Log dog retired
    pub async fn dog_retired<'a, E>(
        executor: E,
        user_id: Uuid,
        dog_id: Uuid,
        dog_name: &str,
        reason: &str,
        note: Option<&str>,
        retired_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "dog_name": dog_name,
            "reason": reason,
            "note": note
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogRetired,
            None,
            Some(dog_id),
            None,
            metadata,
            retired_by,
        )
        .await?;
        Ok(())
    }

    /// Log shift joined (or waitlist joined)
    pub async fn shift_joined<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
        waitlisted: bool,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let event_type = if waitlisted {
            VolunteerEventType::WaitlistJoined
        } else {
            VolunteerEventType::ShiftJoined
        };
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name,
            "waitlisted": waitlisted
        });
        Self::log(executor, user_id, event_type, Some(shift_id), dog_id, None, metadata, Some(user_id)).await?;
        Ok(())
    }

    /// Log shift confirmation (waitlist promotion accepted)
    pub async fn shift_confirmed<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftConfirmed,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift cancelled
    pub async fn shift_cancelled<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
        reason: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name,
            "reason": reason
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftCancelled,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log waitlist promotion
    pub async fn waitlist_promoted<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::WaitlistPromoted,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            None,
        )
        .await?;
        Ok(())
    }

    #[allow(dead_code)]
    /// Log waitlist promotion declined
    pub async fn waitlist_declined<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        agency_name: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::WaitlistDeclined,
            Some(shift_id),
            None,
            None,
            metadata,
            None,
        )
        .await?;
        Ok(())
    }

    /// Log admin contact
    pub async fn contacted_by_admin<'a, E>(
        executor: E,
        user_id: Uuid,
        method: &str,
        subject: &str,
        contacted_by: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "method": method,
            "subject": subject
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ContactedByAdmin,
            None,
            None,
            None,
            metadata,
            Some(contacted_by),
        )
        .await?;
        Ok(())
    }

    /// Log shift invite
    pub async fn shift_invited<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
        invited_by: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name,
            "invited_by": invited_by
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftInvited,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            Some(invited_by),
        )
        .await?;
        Ok(())
    }

    /// Log shift invite accepted
    pub async fn shift_invite_accepted<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
        admin_confirmed: bool,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name,
            "admin_confirmed": admin_confirmed
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftInviteAccepted,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift invite declined
    pub async fn shift_invite_declined<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        dog_id: Option<Uuid>,
        shift_title: &str,
        agency_name: &str,
        volunteer_name: &str,
        dog_name: Option<&str>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name,
            "volunteer_name": volunteer_name,
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftInviteDeclined,
            Some(shift_id),
            dog_id,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log feedback submitted (volunteer survey)
    pub async fn feedback_submitted<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        rating: Option<i16>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "rating": rating
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::FeedbackSubmitted,
            Some(shift_id),
            None,
            None,
            metadata,
            None,
        )
        .await?;
        Ok(())
    }

    /// Log feedback received (peer note)
    pub async fn feedback_received<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        from_volunteer_id: Uuid,
        note_preview: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "note_preview": note_preview.chars().take(100).collect::<String>()
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::FeedbackReceived,
            Some(shift_id),
            None,
            Some(from_volunteer_id),
            metadata,
            None,
        )
        .await?;
        Ok(())
    }

    #[allow(dead_code)]
    /// Log admin note added
    pub async fn note_added<'a, E>(
        executor: E,
        user_id: Uuid,
        note_preview: &str,
        added_by: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "note_preview": note_preview.chars().take(100).collect::<String>()
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::NoteAdded,
            None,
            None,
            None,
            metadata,
            Some(added_by),
        )
        .await?;
        Ok(())
    }

    /// Log note edited with versioning
    pub async fn note_edited<'a, E>(
        executor: E,
        entity_type: &str,
        entity_id: Uuid,
        field_name: &str,
        new_content: Option<&str>,
        previous_version_id: Option<Uuid>,
        edited_by: Uuid,
    ) -> Result<Uuid, sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres> + Clone
    {
        // First, create the note version
        let version_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO note_versions 
                (entity_type, entity_id, field_name, content, previous_version_id, created_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            "#,
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(field_name)
        .bind(new_content)
        .bind(previous_version_id)
        .bind(edited_by)
        .fetch_one(executor.clone())
        .await?;

        // Then log the event
        let metadata = serde_json::json!({
            "entity_type": entity_type,
            "entity_id": entity_id.to_string(),
            "field_name": field_name,
            "version_id": version_id.to_string(),
            "has_content": new_content.is_some()
        });

        Self::log(
            executor,
            edited_by,
            VolunteerEventType::NoteEdited,
            None,
            None,
            None,
            metadata,
            Some(edited_by),
        )
        .await?;

        Ok(version_id)
    }

    /// Log note deleted
    pub async fn note_deleted<'a, E>(
        executor: E,
        entity_type: &str,
        entity_id: Uuid,
        field_name: &str,
        previous_version_id: Option<Uuid>,
        deleted_by: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres> + Clone
    {
        // Create a version record for the deletion (content is NULL)
        let _version_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO note_versions 
                (entity_type, entity_id, field_name, content, previous_version_id, created_by)
            VALUES ($1, $2, $3, NULL, $4, $5)
            RETURNING id
            "#,
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(field_name)
        .bind(previous_version_id)
        .bind(deleted_by)
        .fetch_one(executor.clone())
        .await?;

        // Log the deletion event
        let metadata = serde_json::json!({
            "entity_type": entity_type,
            "entity_id": entity_id.to_string(),
            "field_name": field_name
        });

        Self::log(
            executor,
            deleted_by,
            VolunteerEventType::NoteDeleted,
            None,
            None,
            None,
            metadata,
            Some(deleted_by),
        )
        .await?;

        Ok(())
    }

    /// Get note version history for an entity
    pub async fn get_note_history<'a, E>(
        executor: E,
        entity_type: &str,
        entity_id: Uuid,
        field_name: &str,
    ) -> Result<Vec<NoteVersion>, sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let versions = sqlx::query_as::<_, NoteVersion>(
            r#"
            SELECT 
                nv.id,
                nv.entity_type,
                nv.entity_id,
                nv.field_name,
                nv.content,
                nv.previous_version_id,
                nv.created_by,
                nv.created_at,
                u.display_name as created_by_name
            FROM note_versions nv
            LEFT JOIN users u ON u.id = nv.created_by
            WHERE nv.entity_type = $1 
              AND nv.entity_id = $2 
              AND nv.field_name = $3
            ORDER BY nv.created_at DESC
            "#,
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(field_name)
        .fetch_all(executor)
        .await?;

        Ok(versions)
    }

    /// Log shift created
    pub async fn shift_created<'a, E>(
        executor: E,
        admin_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        agency_name: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "agency_name": agency_name
        });
        Self::log(
            executor,
            admin_id,
            VolunteerEventType::ShiftCreated,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(admin_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift updated
    pub async fn shift_updated<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        changed_fields: Vec<String>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "changed_fields": changed_fields
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftUpdated,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift published
    pub async fn shift_published<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftPublished,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift archived
    pub async fn shift_archived<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ShiftArchived,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log contact added to agency/shift
    pub async fn contact_added<'a, E>(
        executor: E,
        user_id: Uuid,
        shift_id: Uuid,
        contact_name: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "contact_name": contact_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::ContactAdded,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(user_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift change requested
    pub async fn shift_change_requested<'a, E>(
        executor: E,
        requester_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        reason: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "reason": reason
        });
        Self::log(
            executor,
            requester_id,
            VolunteerEventType::ShiftChangeRequested,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(requester_id),
        )
        .await?;
        Ok(())
    }

    /// Log shift change processed (approved/rejected)
    pub async fn shift_change_processed<'a, E>(
        executor: E,
        admin_id: Uuid,
        shift_id: Uuid,
        shift_title: &str,
        approved: bool,
        admin_notes: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let event_type = if approved {
            VolunteerEventType::ShiftChangeApproved
        } else {
            VolunteerEventType::ShiftChangeRejected
        };
        let metadata = serde_json::json!({
            "shift_title": shift_title,
            "admin_notes": admin_notes
        });
        Self::log(
            executor,
            admin_id,
            event_type,
            Some(shift_id),
            None,
            None,
            metadata,
            Some(admin_id),
        )
        .await?;
        Ok(())
    }

    // ============================================================
    // Dog Application Events
    // ============================================================

    /// Log dog application submitted
    pub async fn dog_application_submitted<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogApplicationSubmitted,
            None,
            None,
            None,
            metadata,
            None,
        )
        .await?;
        Ok(())
    }

    /// Log dog application status change (generic)
    pub async fn dog_application_status_changed<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        old_status: &str,
        new_status: &str,
        changed_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let event_type = match new_status {
            "under_review" => VolunteerEventType::DogApplicationUnderReview,
            "pending_assessment" => VolunteerEventType::PendingAssessment,
            "assessment_scheduled" => VolunteerEventType::DogApplicationAssessmentScheduled,
            "assessment_completed" => VolunteerEventType::DogApplicationAssessmentCompleted,
            "approved" => VolunteerEventType::DogApplicationApproved,
            "rejected" => VolunteerEventType::DogApplicationRejected,
            "withdrawn" => VolunteerEventType::DogApplicationWithdrawn,
            _ => return Ok(()), // Don't log unknown status changes
        };

        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name,
            "old_status": old_status,
            "new_status": new_status
        });

        Self::log(executor, user_id, event_type, None, None, None, metadata, changed_by).await?;
        Ok(())
    }

    /// Log dog application approved
    pub async fn dog_application_approved<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        dog_id: Uuid,
        approved_by: Uuid,
        response_reason: Option<&str>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name,
            "dog_id": dog_id.to_string(),
            "response_reason": response_reason
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogApplicationApproved,
            None,
            Some(dog_id),
            None,
            metadata,
            Some(approved_by),
        )
        .await?;
        Ok(())
    }

    /// Log dog application rejected
    pub async fn dog_application_rejected<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        rejected_by: Uuid,
        response_reason: &str,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name,
            "response_reason": response_reason.chars().take(200).collect::<String>()
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogApplicationRejected,
            None,
            None,
            None,
            metadata,
            Some(rejected_by),
        )
        .await?;
        Ok(())
    }

    /// Log assessment scheduled
    pub async fn dog_application_assessment_scheduled<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        volunteer_name: &str,
        session_date: chrono::NaiveDate,
        session_time: chrono::NaiveTime,
        location: &str,
        scheduled_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name,
            "volunteer_name": volunteer_name,
            "session_date": session_date,
            "session_time": session_time,
            "location": location
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogApplicationAssessmentScheduled,
            None,
            None,
            None,
            metadata,
            scheduled_by,
        )
        .await?;
        Ok(())
    }

    /// Log assessment attended
    pub async fn assessment_attended<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        admin_id: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::DogApplicationAssessmentCompleted,
            None,
            None,
            None,
            metadata,
            Some(admin_id),
        )
        .await?;
        Ok(())
    }

    // ============================================================
    // Volunteer Application Events
    // ============================================================

    /// Log volunteer application started
    pub async fn vol_application_started<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        invite_link_id: Option<Uuid>,
        source_tag: Option<&str>,
    ) -> Result<(), sqlx::Error>
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "invite_link_id": invite_link_id.map(|id| id.to_string()),
            "source_tag": source_tag
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::VolApplicationStarted,
            None, None, None,
            metadata,
            None,
        ).await?;
        Ok(())
    }

    /// Log volunteer application status change (generic)
    pub async fn vol_application_status_changed<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        old_status: &str,
        new_status: &str,
        changed_by: Option<Uuid>,
    ) -> Result<(), sqlx::Error>
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let event_type = match new_status {
            "submitted" => VolunteerEventType::VolApplicationSubmitted,
            "under_review" => VolunteerEventType::VolApplicationUnderReview,
            "pending_vsc" => VolunteerEventType::VolApplicationPendingVsc,
            "pending_background_check" => VolunteerEventType::VolApplicationPendingBackground,
            "pending_assessment" => VolunteerEventType::VolApplicationPendingAssessment,
            "assessment_scheduled" => VolunteerEventType::VolApplicationAssessmentScheduled,
            "approved" => VolunteerEventType::VolApplicationApproved,
            "rejected" => VolunteerEventType::VolApplicationRejected,
            "withdrawn" => VolunteerEventType::VolApplicationWithdrawn,
            _ => return Ok(()),
        };

        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "old_status": old_status,
            "new_status": new_status
        });

        Self::log(executor, user_id, event_type, None, None, None, metadata, changed_by).await?;
        Ok(())
    }

    /// Log invite link created
    pub async fn invite_link_created<'a, E>(
        executor: E,
        admin_id: Uuid,
        label: &str,
        slug: Option<&str>,
        source_tag: Option<&str>,
    ) -> Result<(), sqlx::Error>
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "label": label,
            "slug": slug,
            "source_tag": source_tag
        });
        Self::log(
            executor,
            admin_id,
            VolunteerEventType::InviteLinkCreated,
            None, None, None,
            metadata,
            Some(admin_id),
        ).await?;
        Ok(())
    }

    /// Log assessment no-show
    pub async fn assessment_no_show<'a, E>(
        executor: E,
        user_id: Uuid,
        application_id: Uuid,
        dog_name: &str,
        admin_id: Uuid,
    ) -> Result<(), sqlx::Error> 
    where E: sqlx::Executor<'a, Database = sqlx::Postgres>
    {
        let metadata = serde_json::json!({
            "application_id": application_id.to_string(),
            "dog_name": dog_name
        });
        Self::log(
            executor,
            user_id,
            VolunteerEventType::AssessmentNoShow,
            None,
            None,
            None,
            metadata,
            Some(admin_id),
        )
        .await?;
        Ok(())
    }
}
