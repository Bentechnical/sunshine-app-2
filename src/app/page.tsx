// src/app/page.tsx

export default function Home() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ffffff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: '24px',
      textAlign: 'center',
    }}>
      <img
        src="https://rodqnqzfjixznlblnlpe.supabase.co/storage/v1/object/public/sunshine-pics/profile-pictures/assets/Sunshine-Therapy-Dogs-horiz.png"
        alt="Sunshine Therapy Dogs"
        style={{ maxWidth: '300px', marginBottom: '40px' }}
      />
      <h1 style={{ color: '#0e62ae', fontSize: '28px', marginBottom: '16px' }}>
        We&apos;re building something new!
      </h1>
      <p style={{ color: '#4a7a8a', fontSize: '18px', maxWidth: '500px', lineHeight: 1.6 }}>
        The Sunshine App is currently under construction. We&apos;re working on exciting new features to make coordinating therapy dog visits easier than ever.
      </p>
      <p style={{ color: '#4a7a8a', fontSize: '16px', marginTop: '24px' }}>
        Check back soon! In the meantime, reach us at{' '}
        <a href="mailto:info@sunshinetherapydogs.ca" style={{ color: '#0e62ae' }}>
          info@sunshinetherapydogs.ca
        </a>
      </p>
    </div>
  );
}
