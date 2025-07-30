# Database Schema & RLS Rules

## Overview
This document tracks the current database schema, relationships, and Row Level Security (RLS) policies for the Sunshine App 2.0 project.

## Core Tables

### `users` Table
**Primary table for all user profiles**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | text | NO | - | Primary key (Clerk user ID) |
| `first_name` | text | NO | - | User's first name |
| `last_name` | text | NO | - | User's last name |
| `email` | text | NO | - | User's email (unique) |
| `role` | text | NO | - | User role (individual, volunteer, admin) |
| `bio` | text | YES | - | Personal bio or reason for visits |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record update time |
| `profile_image` | text | YES | - | Profile picture URL |
| `phone_number` | text | YES | - | Contact phone number |
| `postal_code` | text | YES | - | Postal code for location matching |
| `location_lat` | double precision | YES | - | Latitude coordinate |
| `location_lng` | double precision | YES | - | Longitude coordinate |
| `travel_distance_km` | integer | YES | - | Max travel distance (volunteers only) |
| `status` | text | YES | 'pending' | User approval status |
| `city` | text | YES | - | City name |
| `profile_complete` | boolean | YES | false | Profile completion flag |

#### Individual User Fields
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `pronouns` | character varying | YES | - | Pronouns of person receiving visits |
| `birthday` | integer | YES | - | Birth year of person receiving visits |
| `physical_address` | text | YES | - | Visit location description |
| `other_pets_on_site` | boolean | YES | false | Whether other pets are present |
| `other_pets_description` | text | YES | - | Description of other pets |
| `third_party_available` | text | YES | - | Third party contact info |
| `additional_information` | text | YES | - | Additional notes |
| `liability_waiver_accepted` | boolean | YES | false | Liability waiver acceptance |
| `liability_waiver_accepted_at` | timestamp with time zone | YES | - | When waiver was accepted |

#### Visit Recipient Fields (NEW)
| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `visit_recipient_type` | text | YES | - | 'self' or 'other' |
| `relationship_to_recipient` | text | YES | - | Relationship description |
| `dependant_name` | text | YES | - | Name of person receiving visits |

### `dogs` Table
**Dog profiles for volunteers**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `volunteer_id` | text | NO | - | Foreign key to users.id |
| `dog_name` | text | NO | - | Dog's name |
| `dog_breed` | text | YES | - | Dog's breed |
| `dog_age` | integer | YES | - | Dog's age |
| `dog_bio` | text | YES | - | Dog's bio |
| `dog_picture_url` | text | YES | - | Dog's photo URL |
| `created_at` | timestamp without time zone | YES | now() | Record creation time |
| `updated_at` | timestamp without time zone | YES | now() | Record update time |
| `status` | text | YES | 'pending' | Dog approval status |

### `appointments` Table
**Scheduled therapy dog visits**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `individual_id` | text | YES | - | Foreign key to users.id (individual) |
| `volunteer_id` | text | YES | - | Foreign key to users.id (volunteer) |
| `start_time` | timestamp with time zone | NO | - | Appointment start time |
| `end_time` | timestamp with time zone | NO | - | Appointment end time |
| `status` | text | YES | 'pending' | Appointment status |
| `availability_id` | text | NO | - | Reference to availability slot |
| `cancellation_reason` | text | YES | - | Reason if cancelled |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record update time |

### `appointment_availability` Table
**Volunteer availability slots**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `volunteer_id` | text | YES | - | Foreign key to users.id |
| `start_time` | timestamp with time zone | NO | - | Slot start time |
| `end_time` | timestamp with time zone | NO | - | Slot end time |
| `rrule` | text | YES | - | Recurrence rule |
| `recurrence_id` | uuid | YES | - | Recurrence group ID |
| `is_hidden` | boolean | YES | false | Whether slot is hidden |
| `created_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | timestamp with time zone | YES | CURRENT_TIMESTAMP | Record update time |

### `audience_categories` Table
**Categories for audience preferences**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | integer | NO | auto-increment | Primary key |
| `name` | text | NO | - | Category name |
| `slug` | text | NO | - | URL slug (unique) |
| `sort_order` | integer | YES | 0 | Display order |

### `individual_audience_tags` Table
**Individual user audience preferences**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `individual_id` | text | NO | - | Foreign key to users.id |
| `category_id` | uuid | NO | - | Foreign key to audience_categories.id |

### `volunteer_audience_preferences` Table
**Volunteer audience preferences**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `volunteer_id` | text | NO | - | Foreign key to users.id |
| `category_id` | integer | NO | - | Foreign key to audience_categories.id |

## Views

### `appointments_with_individuals`
**Appointments with individual user details**

### `dogs_nearby_with_availability`
**Dogs with availability and volunteer info**

### `dogs_with_next_availability`
**Dogs with next available time slot**

## Relationships

### Foreign Key Constraints
- `appointment_availability.volunteer_id` → `users.id`
- `appointments.individual_id` → `users.id`
- `appointments.volunteer_id` → `users.id`
- `dogs.volunteer_id` → `users.id`
- `individual_audience_tags.individual_id` → `users.id`
- `volunteer_audience_preferences.volunteer_id` → `users.id`
- `volunteer_audience_preferences.category_id` → `audience_categories.id`

### Unique Constraints
- `users.email` - Email addresses must be unique
- `dogs.volunteer_id` - One dog per volunteer
- `audience_categories.slug` - Category slugs must be unique

## Row Level Security (RLS) Policies

### `users` Table Policies
- **"Only approved users are visible to public"** - Users can only see approved users or their own profile
- **"User can view own full profile"** - Users can view their complete profile
- **"User can update own profile"** - Users can update their own profile
- **"Users can update only if not denied"** - Users cannot update if status is 'denied'
- **"Allow service role to read users"** - Service role can read all users
- **"Allow service role to update any user"** - Service role can update any user

### `dogs` Table Policies
- **"Only approved dogs are visible to public"** - Only approved dogs are publicly visible
- **"Volunteers can view their own dogs"** - Volunteers can see their own dogs
- **"Volunteers can add their own dogs"** - Volunteers can create dogs for themselves
- **"Volunteers can update their own dogs"** - Volunteers can update their own dogs
- **"Allow service role to read dogs"** - Service role can read all dogs

### `appointments` Table Policies
- **"Users can view their own appointments"** - Users see appointments they're involved in
- **"Users can update their own appointments"** - Users can update their appointments
- **"Individuals can create their own appointments"** - Individuals can create appointments
- **"Allow service role to read appointments"** - Service role can read all appointments
- **"Allow service role to update appointments"** - Service role can update appointments

### `appointment_availability` Table Policies
- **"All users can view all availability"** - Everyone can see availability slots
- **"Volunteers can add their own availability"** - Volunteers can create their own slots
- **"Volunteers can update their own availability"** - Volunteers can update their slots
- **"Volunteers can delete their own availability"** - Volunteers can delete their slots

### `volunteer_audience_preferences` Table Policies
- **"Volunteers can view their own preferences"** - Volunteers see their preferences
- **"Volunteers can insert their own preferences"** - Volunteers can add preferences
- **"Volunteers can update their own preferences"** - Volunteers can update preferences
- **"Volunteers can delete their own preferences"** - Volunteers can delete preferences

## Indexes

### Primary Key Indexes
- `users_pkey` on `users(id)`
- `dogs_pkey` on `dogs(id)`
- `appointments_pkey` on `appointments(id)`
- `appointment_availability_pkey` on `appointment_availability(id)`
- `audience_categories_pkey` on `audience_categories(id)`

### Unique Indexes
- `users_email_key` on `users(email)`
- `dogs_volunteer_id_key` on `dogs(volunteer_id)`
- `audience_categories_slug_key` on `audience_categories(slug)`

### Composite Indexes
- `individual_audience_tags_pkey` on `individual_audience_tags(individual_id, category_id)`
- `volunteer_audience_preferences_pkey` on `volunteer_audience_preferences(volunteer_id, category_id)`

### Regular Indexes
- `individual_audience_tags_category_id_idx` on `individual_audience_tags(category_id)`

## Recent Schema Changes

### 2024-01-XX - Added Visit Recipient Support ✅ COMPLETED
- Added `visit_recipient_type` (text) to `users` table
- Added `relationship_to_recipient` (text) to `users` table  
- Added `dependant_name` (text) to `users` table
- Changed `birthday` from `date` to `integer` (birth year only)
- Updated all frontend components to support dependant profiles
- Updated admin interface to display dependant information
- Updated API routes to include new fields

### Previous Changes
- Added individual user fields (pronouns, birthday, physical_address, etc.)
- Added appointment management fields
- Added location and travel distance fields

## Notes for Development

### User Roles
- **individual**: People seeking therapy dog visits
- **volunteer**: People with therapy dogs offering visits
- **admin**: Platform administrators

### Status Values
- **users.status**: 'pending', 'approved', 'denied'
- **dogs.status**: 'pending', 'approved'
- **appointments.status**: 'pending', 'confirmed', 'cancelled'

### Location Data
- `location_lat`/`location_lng` are populated via geocoding from `postal_code`
- `travel_distance_km` is only used for volunteers

### Visit Recipient Logic
- `visit_recipient_type` determines if visits are for 'self' or 'other'
- When 'other', `dependant_name` and `relationship_to_recipient` are required
- Field labels in the UI change based on recipient type

---
*Last Updated: [Current Date]*
*Schema Version: 2.0* 