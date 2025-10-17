#!/usr/bin/env tsx

/**
 * Email Testing Script
 *
 * This script sends all email templates to a test email address with sample data.
 * Run with: npx tsx scripts/testEmails.ts
 */

import { sendTransactionalEmail } from '../src/app/utils/mailer';
import { formatAppointmentTime } from '../src/utils/dateFormat';

// Configuration
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';

// Sample data for testing all email templates
const sampleData = {
  // User data
  individual: {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john.doe@example.com',
  },
  volunteer: {
    first_name: 'Sarah',
    last_name: 'Smith',
    email: 'sarah.smith@example.com',
  },
  dog: {
    dog_name: 'Buddy',
    dog_breed: 'Golden Retriever',
    dog_age: 5,
  },
  appointment: {
    start_time: new Date('2024-02-15T14:00:00Z'),
    end_time: new Date('2024-02-15T15:00:00Z'),
  },
  cancellationReason: 'Volunteer is unavailable due to illness',
};

// Email template configurations
const emailTemplates = [
  {
    name: 'Welcome Email',
    templateName: 'welcome',
    subject: 'Welcome to Sunshine Therapy Dogs!',
    data: {
      firstName: sampleData.individual.first_name,
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'User Approved Email (Individual)',
    templateName: 'userApprovedIndividual',
    subject: 'Your profile has been approved!',
    data: {
      firstName: sampleData.individual.first_name,
      year: new Date().getFullYear(),
      dashboardLink: 'https://sunshinedogs.app/dashboard',
    },
  },
  {
    name: 'User Approved Email (Volunteer)',
    templateName: 'userApprovedVolunteer',
    subject: 'Your profile has been approved!',
    data: {
      firstName: sampleData.volunteer.first_name,
      year: new Date().getFullYear(),
      dashboardLink: 'https://sunshinedogs.app/dashboard',
    },
  },
  {
    name: 'Individual Request Email',
    templateName: 'individualRequest',
    subject: 'Your Appointment Request Submitted',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      dogBreed: sampleData.dog.dog_breed,
      firstName: sampleData.individual.first_name,
      volunteerName: sampleData.volunteer.first_name,
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'Volunteer Request Email',
    templateName: 'volunteerRequest',
    subject: 'New Appointment Request',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      firstName: sampleData.volunteer.first_name,
      individualName: sampleData.individual.first_name,
      dashboardLink: 'https://sunshinedogs.app/dashboard',
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'Individual Confirmation Email',
    templateName: 'appointmentConfirmedIndividual',
    subject: 'Your Appointment is Confirmed',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      dogBreed: sampleData.dog.dog_breed,
      dogAge: sampleData.dog.dog_age,
      firstName: sampleData.individual.first_name,
      volunteerName: sampleData.volunteer.first_name,
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'Volunteer Confirmation Email',
    templateName: 'appointmentConfirmedVolunteer',
    subject: 'Appointment Confirmed',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      firstName: sampleData.volunteer.first_name,
      individualName: sampleData.individual.first_name,
      dashboardLink: 'https://sunshinedogs.app/dashboard',
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'Individual Cancellation Email',
    templateName: 'appointmentCanceledIndividual',
    subject: 'Your Appointment has been Canceled',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      cancellationReason: sampleData.cancellationReason,
      firstName: sampleData.individual.first_name,
      year: new Date().getFullYear(),
    },
  },
  {
    name: 'Volunteer Cancellation Email',
    templateName: 'appointmentCanceledVolunteer',
    subject: 'Appointment Canceled',
    data: {
      appointmentTime: formatAppointmentTime(sampleData.appointment.start_time),
      dogName: sampleData.dog.dog_name,
      cancellationReason: sampleData.cancellationReason,
      firstName: sampleData.volunteer.first_name,
      year: new Date().getFullYear(),
    },
  },
];

async function testAllEmails() {
  console.log('🚀 Starting email template testing...');
  console.log(`📧 Sending all emails to: ${TEST_EMAIL}`);
  console.log('');

  const results = [];

  for (const template of emailTemplates) {
    try {
      console.log(`📤 Sending: ${template.name}...`);
      
      const result = await sendTransactionalEmail({
        to: TEST_EMAIL,
        subject: `[TEST] ${template.subject}`,
        templateName: template.templateName,
        data: template.data,
      });

      results.push({
        template: template.name,
        status: '✅ Success',
        messageId: result.data?.id || 'Unknown',
      });

      console.log(`   ✅ Sent successfully (ID: ${result.data?.id || 'Unknown'})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        template: template.name,
        status: '❌ Failed',
        error: errorMessage,
      });

      console.log(`   ❌ Failed: ${errorMessage}`);
    }

    // Small delay between emails to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('');
  console.log('📊 Test Results Summary:');
  console.log('========================');
  
  results.forEach(result => {
    console.log(`${result.status} ${result.template}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  const successCount = results.filter(r => r.status === '✅ Success').length;
  const totalCount = results.length;
  
  console.log('');
  console.log(`🎯 Overall: ${successCount}/${totalCount} emails sent successfully`);
  
  if (successCount === totalCount) {
    console.log('🎉 All email templates tested successfully!');
  } else {
    console.log('⚠️  Some email templates failed. Check the errors above.');
  }
}

// Run the test
if (require.main === module) {
  testAllEmails().catch(console.error);
}

export { testAllEmails, emailTemplates, sampleData }; 