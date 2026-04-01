-- Add dog_application_id to admin_alerts
ALTER TABLE admin_alerts ADD COLUMN dog_application_id UUID REFERENCES dog_applications(id) ON DELETE CASCADE;
CREATE INDEX admin_alerts_dog_app_id_idx ON admin_alerts (dog_application_id);
