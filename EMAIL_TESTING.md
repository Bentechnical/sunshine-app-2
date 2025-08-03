# Email Testing Guide

This document explains how to test the transactional emails in the Sunshine App.

## Issues Fixed

The following email issues have been resolved:

### ✅ Fixed Issues
1. **Appointment Confirmation (Individual)**: Now uses correct individual's first name instead of volunteer's
2. **Appointment Request (Individual)**: Now uses correct individual's first name and includes volunteer name
3. **Appointment Cancellation**: Now includes firstName field for both individual and volunteer emails
4. **Volunteer Emails**: Now uses consistent variable names (`individualName` instead of `firstName`)

### 📧 Email Templates Fixed
- `appointmentConfirmedIndividual` - Fixed firstName mapping
- `appointmentConfirmedVolunteer` - Fixed variable consistency
- `appointmentCanceledIndividual` - Added missing firstName
- `appointmentCanceledVolunteer` - Added missing firstName
- `individualRequest` - Fixed firstName mapping and added volunteerName
- `volunteerRequest` - Fixed variable consistency

## Testing Methods

### Method 1: Command Line Script

Run the comprehensive email testing script:

```bash
# Set your test email address
export TEST_EMAIL="your-test-email@example.com"

# Run the script
npx tsx scripts/testEmails.ts
```

This will send all 8 email templates to your test email address with sample data.

### Method 2: API Endpoint

#### Test All Templates
```bash
curl -X POST http://localhost:3000/api/testEmails \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your-test-email@example.com"}'
```

#### Test Single Template
```bash
curl -X POST http://localhost:3000/api/testEmails \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your-test-email@example.com", "templateName": "welcome"}'
```

#### List Available Templates
```bash
curl http://localhost:3000/api/testEmails
```

### Method 3: Admin Dashboard

1. Navigate to the admin dashboard
2. Look for the "Email Testing" section (if added to the admin interface)
3. Enter your test email address
4. Choose to test all templates or a specific one
5. Click "Test Templates"

## Available Templates

| Template Name | Description | Variables Used |
|---------------|-------------|----------------|
| `welcome` | Welcome email for new users | `firstName`, `year` |
| `userApproved` | User approval notification | `firstName`, `year`, `dashboardLink` |
| `individualRequest` | Individual appointment request | `appointmentTime`, `dogName`, `dogBreed`, `dogAge`, `firstName`, `volunteerName`, `year` |
| `volunteerRequest` | Volunteer appointment request | `appointmentTime`, `dogName`, `firstName`, `individualName`, `dashboardLink`, `year` |
| `appointmentConfirmedIndividual` | Individual confirmation | `appointmentTime`, `dogName`, `dogBreed`, `dogAge`, `firstName`, `volunteerName`, `year` |
| `appointmentConfirmedVolunteer` | Volunteer confirmation | `appointmentTime`, `dogName`, `firstName`, `individualName`, `dashboardLink`, `year` |
| `appointmentCanceledIndividual` | Individual cancellation | `appointmentTime`, `dogName`, `cancellationReason`, `firstName`, `year` |
| `appointmentCanceledVolunteer` | Volunteer cancellation | `appointmentTime`, `dogName`, `cancellationReason`, `firstName`, `year` |

## Sample Data Used

The testing tools use the following sample data:

```javascript
{
  individual: { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com' },
  volunteer: { first_name: 'Sarah', last_name: 'Smith', email: 'sarah.smith@example.com' },
  dog: { dog_name: 'Buddy', dog_breed: 'Golden Retriever', dog_age: 5 },
  appointment: { start_time: new Date('2024-02-15T14:00:00Z') },
  cancellationReason: 'Volunteer is unavailable due to illness'
}
```

## Environment Variables

Make sure you have the following environment variables set:

```bash
RESEND_API_KEY=your_resend_api_key
```

## Troubleshooting

### Common Issues

1. **"Missing RESEND_API_KEY"**: Ensure your Resend API key is set in environment variables
2. **"Template not found"**: Check that the template file exists in `templates/emails/`
3. **"Invalid email address"**: Ensure the test email address is valid
4. **Rate limiting**: The script includes delays between emails to avoid rate limiting

### Debugging

To debug email issues:

1. Check the browser console for errors
2. Check the server logs for detailed error messages
3. Verify that all template variables are being passed correctly
4. Test individual templates to isolate issues

## Production Testing

Before deploying to production:

1. Test all email templates with real data
2. Verify email delivery and formatting
3. Check that personalization is working correctly
4. Test edge cases (missing data, special characters, etc.)

## Security Notes

- The email testing API should only be available in development/staging environments
- Consider adding authentication to the testing endpoints in production
- Never send test emails to real user email addresses without permission 