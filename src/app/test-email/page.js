'use client';

import { useState } from 'react';
import { testSendEmail } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function TestEmailPage() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData) {
    setLoading(true);
    setMessage('');

    try {
      const result = await testSendEmail(formData);
      setMessage(result.message);
    } catch (error) {
      setMessage('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Test Server-Side Emailer</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Recipient Email
              </label>
              <Input
                type="email"
                name="email"
                id="email"
                placeholder="Enter your email to test"
                required
                className=" text-white"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending...' : 'Send Test Email'}
            </Button>
            {message && (
              <p className={`text-sm mt-2 ${message.includes('Failed') ? 'text-red-500' : 'text-green-500'}`}>
                {message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
