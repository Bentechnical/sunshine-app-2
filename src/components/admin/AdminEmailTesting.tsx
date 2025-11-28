'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, CheckCircle, XCircle } from 'lucide-react';

interface EmailTemplate {
  name: string;
  templateName: string;
  subject: string;
}

interface TestResult {
  template: string;
  status: 'success' | 'error';
  messageId?: string;
  error?: string;
}

interface EmailField {
  key: string;
  label: string;
  type: 'text' | 'email' | 'date' | 'time' | 'textarea' | 'select';
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

const templateFields: Record<string, EmailField[]> = {
  welcome: [
    { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John', required: true },
  ],
  userApprovedIndividual: [
    { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'dashboardLink', label: 'Dashboard Link', type: 'text', placeholder: 'https://sunshinedogs.app/dashboard', required: true },
  ],
  userApprovedVolunteer: [
    { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'dashboardLink', label: 'Dashboard Link', type: 'text', placeholder: 'https://sunshinedogs.app/dashboard', required: true },
  ],
  individualRequest: [
    { key: 'firstName', label: 'Individual First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'volunteerName', label: 'Volunteer First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'dogBreed', label: 'Dog Breed', type: 'text', placeholder: 'Golden Retriever', required: true },
  ],
  volunteerRequest: [
    { key: 'firstName', label: 'Volunteer First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'individualName', label: 'Individual First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'dashboardLink', label: 'Dashboard Link', type: 'text', placeholder: 'https://sunshinedogs.app/dashboard', required: true },
  ],
  appointmentConfirmedIndividual: [
    { key: 'firstName', label: 'Individual First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'volunteerName', label: 'Volunteer First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'dogBreed', label: 'Dog Breed', type: 'text', placeholder: 'Golden Retriever', required: true },
    { key: 'dogAge', label: 'Dog Age', type: 'text', placeholder: '5', required: true },
  ],
  appointmentConfirmedVolunteer: [
    { key: 'firstName', label: 'Volunteer First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'individualName', label: 'Individual First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'dashboardLink', label: 'Dashboard Link', type: 'text', placeholder: 'https://sunshinedogs.app/dashboard', required: true },
  ],
  appointmentCanceledIndividual: [
    { key: 'firstName', label: 'Individual First Name', type: 'text', placeholder: 'John', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'cancellationReason', label: 'Cancellation Reason', type: 'textarea', placeholder: 'Volunteer is unavailable due to illness', required: true },
  ],
  appointmentCanceledVolunteer: [
    { key: 'firstName', label: 'Volunteer First Name', type: 'text', placeholder: 'Sarah', required: true },
    { key: 'appointmentTime', label: 'Appointment Time', type: 'text', placeholder: 'February 15, 2024 at 2:00 PM', required: true },
    { key: 'dogName', label: 'Dog Name', type: 'text', placeholder: 'Buddy', required: true },
    { key: 'cancellationReason', label: 'Cancellation Reason', type: 'textarea', placeholder: 'Volunteer is unavailable due to illness', required: true },
  ],
};

export default function AdminEmailTesting() {
  const [testEmail, setTestEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Fetch available templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Reset form data when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const fields = templateFields[selectedTemplate] || [];
      const initialData: Record<string, string> = {};
      fields.forEach(field => {
        initialData[field.key] = '';
      });
      setFormData(initialData);
    }
  }, [selectedTemplate]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/testEmails');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleInputChange = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };



  const handleTestEmail = async () => {
    if (!testEmail || !selectedTemplate) return;

    setIsLoading(true);
    setResults([]);

    // Prepare data with placeholder defaults for empty fields
    const fields = templateFields[selectedTemplate] || [];
    const dataWithDefaults: Record<string, string> = {};
    
    fields.forEach(field => {
      const userValue = formData[field.key] || '';
      // Use placeholder as default if field is empty
      dataWithDefaults[field.key] = userValue.trim() || field.placeholder || '';
    });

    try {
      const response = await fetch('/api/testEmails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          testEmail, 
          templateName: selectedTemplate,
          customData: dataWithDefaults
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setResults([{
          template: data.template,
          status: 'success',
          messageId: data.messageId,
        }]);
      } else {
        setResults([{
          template: selectedTemplate,
          status: 'error',
          error: data.error,
        }]);
      }
    } catch (error) {
      setResults([{
        template: selectedTemplate,
        status: 'error',
        error: 'Network error',
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderField = (field: EmailField) => {
    const value = formData[field.key] || '';
    
    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="w-full p-2 border border-gray-300 rounded-md min-h-[80px] resize-y"
            required={field.required}
          />
        );
      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
            required={field.required}
          >
            <option value="">Select...</option>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        );
      default:
        return (
          <Input
            type={field.type}
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        );
    }
  };

  const currentFields = selectedTemplate ? templateFields[selectedTemplate] || [] : [];

  return (
    <div className="space-y-6">
      {/* Admin Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Admin Notification Settings
          </CardTitle>
          <CardDescription>
            Email addresses that receive notifications when new users complete their profiles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Environment Variable Status:</p>
            <p className="text-xs text-gray-600 mb-2">
              Note: ADMIN_NOTIFICATION_EMAIL is a server-side variable and cannot be displayed here.
              Check Vercel dashboard → Settings → Environment Variables to verify it's set.
            </p>
            <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-xs font-medium text-blue-900">Expected Configuration:</p>
              <p className="text-xs text-blue-800 font-mono mt-1">ADMIN_NOTIFICATION_EMAIL=ben@sunshinetherapydogs.ca,info@sunshinetherapydogs.ca</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Multiple emails can be separated by commas. All recipients will receive a single email (not separate emails).
          </p>
        </CardContent>
      </Card>

      {/* Email Template Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Template Testing
          </CardTitle>
          <CardDescription>
            Test email templates with custom data by filling in the fields below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="testEmail" className="text-sm font-medium">
              Test Email Address
            </label>
            <Input
              id="testEmail"
              type="email"
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="template" className="text-sm font-medium">
              Email Template
            </label>
            <select
              id="template"
              className="w-full p-2 border border-gray-300 rounded-md"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Select a template...</option>
              {templates.map((template) => (
                <option key={template.templateName} value={template.templateName}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && currentFields.length > 0 && (
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="font-medium text-gray-900">Template Data (Optional)</h3>
              <p className="text-sm text-gray-600">Leave fields empty to use placeholder values as defaults.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentFields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                      {field.label}
                    </label>
                    {renderField(field)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleTestEmail}
              disabled={!testEmail || !selectedTemplate || isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Send Test Email
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Email test results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2 p-2 rounded ${
                    result.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  {result.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className="font-medium">{result.template}</span>
                  {result.status === 'success' ? (
                    <span className="text-sm text-green-600">
                      Sent successfully {result.messageId && `(ID: ${result.messageId})`}
                    </span>
                  ) : (
                    <span className="text-sm text-red-600">
                      Failed: {result.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 