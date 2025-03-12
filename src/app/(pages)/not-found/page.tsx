import React from 'react';
import Link from 'next/link';

const NotFoundPage = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md text-center">
        <h2 className="text-4xl font-semibold text-gray-800 mb-4">404</h2>
        <p className="text-lg text-gray-600">Page Not Found</p>
        <Link href="/">
          <a className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">Go to Home</a>
        </Link>
      </div>
    </div>
  );
};

export default NotFoundPage;
