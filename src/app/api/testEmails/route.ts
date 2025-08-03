// src/app/api/testEmails/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { sendTransactionalEmail } from '../../utils/mailer';

// Sample data for testing
const sampleData = {
  individual: { first_name: 'John', last_name: 'Doe', email: 'john.doe@example.com' },
  volunteer: { first_name: 'Sarah', last_name: 'Smith', email: 'sarah.smith@example.com' },
  dog: { dog_name: 'Buddy', dog_breed: 'Golden Retriever', dog_age: 5 },
  appointment: { start_time: new Date('2024-02-15T14:00:00Z') },
  cancellationReason: 'Volunteer is unavailable due to illness',
};

const emailTemplates = [
  {
    name: 'Welcome Email',
    templateName: 'welcome',
    subject: 'Welcome to Sunshine Therapy Dogs!',
    data: { firstName: sampleData.individual.first_name, year: new Date().getFullYear() },
  },
  {
    name: 'User Approved Email',
    templateName: 'userApproved',
    subject: 'Your profile has been approved!',
    data: {
      firstName: sampleData.individual.first_name,
      year: new Date().getFullYear(),
      dashboardLink: 'https://sunshinedogs.app/dashboard',
    },
  },
  {
    name: 'Individual Request Email',
    templateName: 'individualRequest',
    subject: 'Your Appointment Request Submitted',
    data: {
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
      dogName: sampleData.dog.dog_name,
      dogBreed: sampleData.dog.dog_breed,
      dogAge: sampleData.dog.dog_age,
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
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
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
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
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
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
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
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
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
      appointmentTime: sampleData.appointment.start_time.toLocaleString(),
      dogName: sampleData.dog.dog_name,
      cancellationReason: sampleData.cancellationReason,
      firstName: sampleData.volunteer.first_name,
      year: new Date().getFullYear(),
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const { testEmail, templateName, customData } = await req.json();
    
    // Validate input
    if (!testEmail) {
      return NextResponse.json(
        { success: false, error: 'Missing testEmail parameter' },
        { status: 400 }
      );
    }

    // If specific template requested, send only that one
    if (templateName) {
      const template = emailTemplates.find(t => t.templateName === templateName);
      if (!template) {
        return NextResponse.json(
          { success: false, error: `Template '${templateName}' not found` },
          { status: 404 }
        );
      }

      // Use custom data if provided, otherwise use default template data
      const emailData = customData ? {
        ...template.data,
        ...customData,
        year: new Date().getFullYear(), // Always include current year
      } : template.data;

      const result = await sendTransactionalEmail({
        to: testEmail,
        subject: `[TEST] ${template.subject}`,
        templateName: template.templateName,
        data: emailData,
      });

      return NextResponse.json({
        success: true,
        message: `Test email sent for template: ${template.name}`,
        template: template.name,
        messageId: result.data?.id,
      });
    }

    // Send all templates
    const results = [];
    
    for (const template of emailTemplates) {
      try {
        const result = await sendTransactionalEmail({
          to: testEmail,
          subject: `[TEST] ${template.subject}`,
          templateName: template.templateName,
          data: template.data,
        });

        results.push({
          template: template.name,
          status: 'success',
          messageId: result.data?.id,
        });
      } catch (error) {
        results.push({
          template: template.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      // Small delay between emails
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const totalCount = results.length;

    return NextResponse.json({
      success: true,
      message: `Sent ${successCount}/${totalCount} test emails successfully`,
      results,
      summary: {
        total: totalCount,
        successful: successCount,
        failed: totalCount - successCount,
      },
    });

  } catch (error) {
    console.error('Error in testEmails API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return available templates for reference
  return NextResponse.json({
    success: true,
    templates: emailTemplates.map(t => ({
      name: t.name,
      templateName: t.templateName,
      subject: t.subject,
    })),
    usage: {
      single: 'POST with { "testEmail": "your@email.com", "templateName": "welcome" }',
      all: 'POST with { "testEmail": "your@email.com" }',
    },
  });
} 