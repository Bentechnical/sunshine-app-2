# Native App Deployment Guide

**Complete strategy for deploying Sunshine Therapy Dogs to iOS App Store and Google Play Store**

This document provides a comprehensive, step-by-step guide for converting the existing Next.js web app into native iOS and Android applications using Capacitor. Written for developers with basic native app knowledge.
Note: this document was written by Claude, so might have errors or an incomplete understanding of functions of the app. Please check with the user/developer if you are unsure.
---

## Table of Contents

1. [Overview & Strategy](#overview--strategy)
2. [Prerequisites & Account Setup](#prerequisites--account-setup)
3. [Development Environment Setup](#development-environment-setup)
4. [Capacitor Installation & Configuration](#capacitor-installation--configuration)
5. [Native Project Setup](#native-project-setup)
6. [App Assets & Branding](#app-assets--branding)
7. [Platform-Specific Configuration](#platform-specific-configuration)
8. [Testing Strategy](#testing-strategy)
9. [Build & Deployment Workflows](#build--deployment-workflows)
10. [Version Management](#version-management)
11. [Release Schedule & Strategy](#release-schedule--strategy)
12. [Troubleshooting](#troubleshooting)
13. [Maintenance & Updates](#maintenance--updates)

---

## Overview & Strategy

### What We're Building

We're using **Capacitor** (by Ionic) to wrap our existing Next.js web app into native iOS and Android applications. This approach:

- ✅ Requires **zero** Swift or Kotlin knowledge
- ✅ Uses our existing Next.js codebase (no rewrite needed)
- ✅ Allows publishing to both App Store and Google Play
- ✅ Enables native features (push notifications, camera, etc.)
- ✅ Maintains a **single codebase** for web, iOS, and Android

### Architecture: Remote Web App + Native Shell

**How it works:**
- The Sunshine web app continues to run on Vercel (dynamic Next.js with Clerk, Supabase, Stream Chat, cron jobs, etc.).
- Capacitor ships thin iOS/Android shells that open the hosted site in a secure WebView (`WKWebView` / `Chromium`).
- Native layers handle splash screens, deep links, push notifications, camera access, and any future device APIs.
- When we update the web app on Vercel, users automatically see the changes inside the native shell.
- App Store / Play Store resubmissions are only needed when the shell itself changes (new icons, plugin additions, native permission text, etc.).

**Why Apple/Google accept this:**
- The app delivers gated functionality (appointments, messaging, volunteer tools) that requires authentication and provides real utility—it's not just a brochure site.
- We use platform conventions: full-screen presentation, proper metadata, optional push notifications, and native deep-link handling.
- Both stores already approve many production apps implemented with Capacitor/Ionic, Trusted Web Activities, or custom WebViews as long as they are high-quality experiences.

**Benefits:**
- 🔄 **Single codebase** – Next.js remains the source of truth.
- ⚡ **Fast iteration** – Ship most updates by deploying to Vercel; no store review needed.
- 🔔 **Native capabilities** – Push notifications, biometrics, and other plugins can be added incrementally.
- 🛡️ **Security** – Secrets stay on the server; nothing sensitive is bundled inside the binary.

### Cost Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer Account | $99 | Per year |
| Google Play Developer Account | $25 | One-time |
| Capacitor (open source) | Free | N/A |
| Xcode | Free | N/A |
| Android Studio | Free | N/A |
| **TOTAL FIRST YEAR** | **$124** | - |
| **TOTAL RECURRING** | **$99/year** | Annual |

---

## Prerequisites & Account Setup

### Step 1: Apple Developer Account

**Required for iOS App Store distribution**

1. **Sign up:**
   - Go to https://developer.apple.com/programs/
   - Click "Enroll" (top right)
   - You'll need:
     - Apple ID (create one at https://appleid.apple.com if needed)
     - Valid payment method (credit card)
     - Two-factor authentication enabled on your Apple ID

2. **Choose account type:**
   - **Individual** ($99/year) - Recommended for single developer
     - App published under your name
     - Faster approval process
   - **Organization** ($99/year) - For registered businesses
     - App published under company name
     - Requires D-U-N-S number and legal verification

3. **Complete enrollment:**
   - Fill out personal/business information
   - Agree to Apple Developer Program License Agreement
   - Pay $99 annual fee
   - Wait for approval (usually 24-48 hours, can be up to 5 days)

4. **After approval:**
   - Access App Store Connect at https://appstoreconnect.apple.com
   - Accept any additional agreements
   - Set up banking/tax info (required before publishing)

**Important notes:**
- You need a **Mac computer** to build iOS apps (Xcode only runs on macOS)
- Can't use iPhone simulator on Windows/Linux
- Annual renewal required to keep apps published

---

### Step 2: Google Play Developer Account

**Required for Android Play Store distribution**

1. **Sign up:**
   - Go to https://play.google.com/console/signup
   - You'll need:
     - Google account
     - Valid payment method
     - $25 one-time registration fee

2. **Account setup:**
   - Choose account type:
     - **Personal** - Published under your name
     - **Organization** - Published under company name (requires verification)
   - Fill out developer profile
   - Pay $25 fee (one-time, non-refundable)
   - Wait for approval (usually within 24 hours)

3. **After approval:**
   - Access Google Play Console at https://play.google.com/console
   - Complete account verification if required
   - Accept Developer Distribution Agreement
   - Set up merchant account (if planning to charge for app or in-app purchases)

**Important notes:**
- No renewal fee (unlike Apple's annual charge)
- Can build Android apps on Mac, Windows, or Linux
- Identity verification required for all new accounts (2023+ policy)

---

### Step 3: TestFlight Setup (iOS Beta Testing)

**Free beta testing platform for iOS apps**

1. **Access:**
   - Built into App Store Connect (no separate signup needed)
   - Automatically available after Apple Developer Account approval

2. **Types of testing:**
   - **Internal Testing** (up to 100 users)
     - For your team/organization
     - No review process - instant updates
     - Users must have Apple Developer account access
   - **External Testing** (up to 10,000 users)
     - For public beta testers
     - Light review process (usually approved in hours)
     - Users don't need developer accounts

3. **Inviting testers:**
   - Can invite via email address or public link
   - Testers download "TestFlight" app from App Store
   - They receive notifications when new builds available

**Best for beta phase:** External Testing with public link

---

### Step 4: Google Play Internal Testing

**Free beta testing for Android apps**

1. **Access:**
   - Built into Google Play Console
   - Available immediately after account approval

2. **Testing tracks:**
   - **Internal Testing** (up to 100 users)
     - No review required
     - Instant updates
     - Add testers via email or Google Group
   - **Closed Testing** (unlimited users)
     - Minimal review (usually hours)
     - Can create multiple tracks (alpha, beta, etc.)
   - **Open Testing** (unlimited users)
     - Anyone can join
     - Faster review than production

3. **Inviting testers:**
   - Add individual emails or use Google Groups
   - Can generate shareable opt-in link
   - Testers install directly from Play Store

**Best for beta phase:** Internal Testing or Closed Testing

---

## Development Environment Setup

### Mac Setup (Required for iOS, Optional for Android)

**Install Xcode:**

1. **Download Xcode:**
   - Open App Store on Mac
   - Search for "Xcode"
   - Click "Get" (it's free, but ~13 GB download)
   - Installation takes 20-40 minutes

2. **Install Command Line Tools:**
   ```bash
   xcode-select --install
   ```
   - If already installed, you'll see: "command line tools are already installed"

3. **Accept Xcode License:**
   ```bash
   sudo xcodebuild -license accept
   ```

4. **Install iOS Simulator:**
   - Open Xcode
   - Go to Xcode → Settings → Platforms
   - Click "Get" next to iOS
   - Download latest iOS simulator (~7 GB)

5. **Install CocoaPods (iOS dependency manager):**
   ```bash
   sudo gem install cocoapods
   ```

**Verify installation:**
```bash
xcodebuild -version
# Should show: Xcode 15.x (or latest)

pod --version
# Should show: 1.x.x
```

---

### Windows/Mac/Linux Setup (Android)

**Install Android Studio:**

1. **Download:**
   - Go to https://developer.android.com/studio
   - Download for your OS (Windows/Mac/Linux)
   - ~1 GB download

2. **Install:**
   - Run installer
   - Choose "Standard" installation
   - Accept licenses
   - Let it download Android SDK (~3 GB)
   - Installation takes 15-30 minutes

3. **Configure Android SDK:**
   - Open Android Studio
   - Click "More Actions" → "SDK Manager"
   - Under "SDK Platforms" tab:
     - Check "Android 13.0 (Tiramisu)" or latest
     - Check "Android 12.0 (S)"
   - Under "SDK Tools" tab:
     - Check "Android SDK Build-Tools"
     - Check "Android Emulator"
     - Check "Android SDK Platform-Tools"
   - Click "Apply" → Download (~2 GB)

4. **Set environment variables:**

   **Mac/Linux (.zshrc or .bashrc):**
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   ```

   **Windows (System Environment Variables):**
   - Add `ANDROID_HOME` = `C:\Users\YourUsername\AppData\Local\Android\Sdk`
   - Add to PATH: `%ANDROID_HOME%\platform-tools`

5. **Create virtual device (emulator):**
   - Open Android Studio
   - Click "More Actions" → "Virtual Device Manager"
   - Click "Create Device"
   - Choose "Pixel 6" or similar
   - Download system image (Android 13 recommended)
   - Finish setup

**Verify installation:**
```bash
adb --version
# Should show: Android Debug Bridge version x.x.x
```

---

### Node.js & NPM (Already Installed)

Your project already has Node.js configured:
- Current version requirement: `>=16.x.x` (from package.json)
- Recommended: Node 18 or Node 20 LTS

**Verify:**
```bash
node --version
# Should show: v18.x.x or v20.x.x

npm --version
# Should show: 9.x.x or higher
```

---

## Capacitor Installation & Configuration

### Step 1: Install Capacitor Packages

```bash
# Install Capacitor CLI and core packages
npm install @capacitor/core @capacitor/cli

# Install platform-specific packages
npm install @capacitor/ios @capacitor/android

# Install recommended plugins
npm install @capacitor/camera
npm install @capacitor/push-notifications
npm install @capacitor/network
npm install @capacitor/status-bar
npm install @capacitor/splash-screen
npm install @capacitor/keyboard
npm install @capacitor/haptics
```

**Total install time:** ~2-3 minutes

---

### Step 2: Initialize Capacitor

```bash
npx cap init
```

You'll be prompted for:

1. **App name:** `Sunshine Therapy Dogs`
   - This is the user-facing name shown on home screen
   - Can contain spaces and special characters

2. **App ID (package name):** `com.sunshinetherapydogs.app`
   - Reverse domain format
   - Must be unique across all apps
   - **Cannot be changed later** without republishing as new app
   - No spaces, use lowercase
   - Common format: `com.yourcompany.appname`

3. **Web directory:** `dist` (or `out`)
   - Capacitor requires a folder even if we load everything remotely
   - We can keep the default stub assets for now; it's just a fallback splash page

**What this creates:**
- `capacitor.config.ts` - Main Capacitor configuration file
- `capacitor.config.json` - Alternative JSON format (we'll use .ts)

---

### Step 3: Point Capacitor at the Hosted Sunshine App

Instead of converting the app to static files, we keep the full Next.js experience running on Vercel (with Clerk auth, Supabase APIs, Stream Chat tokens, cron jobs, etc.). Capacitor simply loads that hosted site inside a native WebView.

1. **No Next.js changes required today.** Keep `next.config.ts` exactly as-is; we still rely on server rendering, API routes, and environment variables that must never ship inside the app bundle.
2. **Confirm the public URL.** Decide which deployment the native shell should open (e.g., `https://sunshinedogs.app` for production, or a staging URL). Set `NEXT_PUBLIC_APP_URL` accordingly so links, manifests, and push links remain consistent.
3. **Configure Capacitor’s server settings** (next step) so iOS/Android always load the hosted site. This keeps secrets on the server and lets us ship UI changes without resubmitting to Apple/Google.
4. **Optional fallback.** We can later add a lightweight offline page to `dist/` if we ever want to show a friendly “You’re offline” message. It’s not required for v1.

---

### Step 4: Create Capacitor Configuration

**Edit `capacitor.config.ts`:**

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sunshinetherapydogs.app',
  appName: 'Sunshine Therapy Dogs',
  webDir: 'dist', // simple fallback assets, not our prod app
  server: {
    url: 'https://sunshinedogs.app', // Hosted Next.js deployment
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'always', // Handle notch/safe areas
  },
  android: {
    buildOptions: {
      keystorePath: undefined, // Set during signing setup
      keystoreAlias: undefined,
    },
  },
};

export default config;
```

**Tip:** When testing staging builds, change `server.url` to the staging domain (e.g., `https://staging.sunshinedogs.app`) and rebuild the native project. Keep production and staging packages separate in App Store Connect / Google Play Console so you know which shell points where.

---

### Step 5: Update package.json Scripts

**Add to `package.json` scripts section:**

```json
{
  "scripts": {
    // Existing scripts...
    "dev": "next dev",
    "build": "next build",

    // Capacitor workflows (no static export needed):
    "cap:sync": "npx cap sync",
    "cap:sync:ios": "npx cap sync ios",
    "cap:sync:android": "npx cap sync android",
    "cap:open:ios": "npx cap open ios",
    "cap:open:android": "npx cap open android",
    "cap:run:ios": "npx cap run ios --external",
    "cap:run:android": "npx cap run android --external",

    // Convenience wrappers:
    "native:sync": "npm run cap:sync",
    "native:ios": "npm run cap:sync:ios && npm run cap:open:ios",
    "native:android": "npm run cap:sync:android && npm run cap:open:android"
  }
}
```

**Script explanations:**
- `cap:sync` - Pull latest Capacitor config + placeholder web assets into native projects
- `cap:open:ios` - Open iOS project in Xcode
- `cap:open:android` - Open Android project in Android Studio
- `native:sync` - Build and sync to both platforms

---

### Step 6: Add Native Platforms

```bash
# Add iOS platform (Mac only)
npx cap add ios

# Add Android platform (any OS)
npx cap add android
```

**What this creates:**

```
sunshine-app-2/
├── ios/                    # iOS native project
│   └── App/
│       ├── App.xcodeproj  # Xcode project
│       ├── App/           # iOS source files
│       └── Podfile        # iOS dependencies
├── android/               # Android native project
│   ├── app/
│   │   └── src/main/
│   ├── build.gradle       # Build configuration
│   └── gradle/            # Gradle wrapper
└── capacitor.config.ts
```

**First sync:**
```bash
npm run native:sync
```

This copies your Next.js build to native projects.

**Time:** ~3-5 minutes for first run

---

## Native Project Setup

### iOS Project Configuration

**Open iOS project:**
```bash
npm run cap:open:ios
```

This opens Xcode with your project.

#### 1. Configure Signing & Capabilities

**In Xcode:**

1. Click on "App" in the left sidebar (blue icon at top)
2. Select "App" target under TARGETS
3. Click "Signing & Capabilities" tab

**Signing:**
- **Automatically manage signing:** ✅ Check this (recommended)
- **Team:** Select your Apple Developer account
  - If not showing, click "Add Account" and sign in
- **Bundle Identifier:** `com.sunshinetherapydogs.app`
  - Should auto-populate from Capacitor config
  - Must match App ID from Capacitor init

**If you see errors:**
- "Failed to register bundle identifier" = Already taken (change bundle ID)
- "No signing certificate" = Need to download certificates (Xcode handles automatically)

#### 2. Add Required Capabilities

Still in "Signing & Capabilities" tab:

1. Click "+ Capability" button (top left)
2. Add these capabilities:
   - **Push Notifications** (for chat notifications)
   - **Background Modes** → Check:
     - Remote notifications
     - Background fetch
   - **Associated Domains** (if using deep links)

#### 3. Configure Info.plist Permissions

**Location:** `ios/App/App/Info.plist`

Add these privacy descriptions (required by Apple):

```xml
<key>NSCameraUsageDescription</key>
<string>We need access to your camera to upload photos of therapy dogs and update profile pictures.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>We need access to your photo library to select and upload images.</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>We need permission to save photos to your library.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>We use your location to help match you with nearby therapy dog volunteers.</string>

<key>NSUserTrackingUsageDescription</key>
<string>This identifier will be used to deliver personalized content to you.</string>

<key>NSMicrophoneUsageDescription</key>
<string>We need access to your microphone for video calls with volunteers (if enabled in future).</string>
```

**Why these are required:**
- Apple rejects apps that access device features without explanation
- Each permission triggers a popup when first used
- Users see these descriptions in the permission dialog

#### 4. Configure Deep Linking (For Clerk OAuth)

Clerk authentication uses OAuth redirects. Need to configure URL schemes.

**In Info.plist, add:**

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.sunshinetherapydogs.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>sunshinetherapydogs</string>
    </array>
  </dict>
</array>
```

**Then update Clerk settings:**
- Go to Clerk Dashboard → Your App → Settings
- Add redirect URL: `sunshinetherapydogs://oauth-callback`

#### 5. Configure App Transport Security

Add to Info.plist (allows HTTPS and secure WebSocket):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
  <key>NSAllowsLocalNetworking</key>
  <true/>
</dict>
```

**Note:** We use `false` for arbitrary loads (secure by default), but allow local networking for development.

---

### Android Project Configuration

**Open Android project:**
```bash
npm run cap:open:android
```

This opens Android Studio.

#### 1. Configure App Information

**File:** `android/app/src/main/res/values/strings.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Sunshine Therapy Dogs</string>
    <string name="title_activity_main">Sunshine Therapy Dogs</string>
    <string name="package_name">com.sunshinetherapydogs.app</string>
    <string name="custom_url_scheme">sunshinetherapydogs</string>
</resources>
```

#### 2. Configure AndroidManifest.xml Permissions

**File:** `android/app/src/main/AndroidManifest.xml`

Add these permissions before `<application>` tag:

```xml
<!-- Required permissions -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Optional permissions (for features) -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
                 android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
                 android:maxSdkVersion="28" />

<!-- Push notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Location (if needed) -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- Vibration for notifications -->
<uses-permission android:name="android.permission.VIBRATE" />
```

#### 3. Configure Deep Linking

In `AndroidManifest.xml`, inside `<activity>` tag, add:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="sunshinetherapydogs" />
</intent-filter>
```

**Update Clerk Dashboard:**
- Add redirect URL: `sunshinetherapydogs://oauth-callback`

#### 4. Configure build.gradle

**File:** `android/app/build.gradle`

Ensure these settings:

```gradle
android {
    compileSdkVersion 34

    defaultConfig {
        applicationId "com.sunshinetherapydogs.app"
        minSdkVersion 22  // Android 5.1+ (covers 95%+ devices)
        targetSdkVersion 34
        versionCode 1
        versionName "0.1.0"  // Match package.json version
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

#### 5. Handle Network Security

**File:** `android/app/src/main/res/xml/network_security_config.xml`

Create this file:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Allow localhost for development -->
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```

Reference it in AndroidManifest.xml `<application>` tag:

```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

---

## App Assets & Branding

### Required Assets

Both platforms need various icon and splash screen sizes.

**Recommended approach:** Use a source image and generate all sizes.

#### Source Requirements

**App Icon:**
- Minimum size: 1024×1024 pixels
- Format: PNG with no transparency (iOS requirement)
- Design: Keep important content in center 80% (corners may be cropped)
- Current source: `/public/web-app-manifest-512x512.png` (need to upscale to 1024×1024)

**Splash Screen:**
- Minimum size: 2732×2732 pixels (iPad Pro 12.9")
- Format: PNG
- Design: Simple logo on solid background (content will be cropped for different screen sizes)

#### Generate Assets Using Online Tool

**Recommended tool:** https://www.appicon.co/

1. Go to https://www.appicon.co/
2. Upload your 1024×1024 app icon
3. Select both iOS and Android
4. Download generated assets

**What you get:**
- iOS: AppIcon.appiconset folder with all sizes
- Android: mipmap folders with all densities

#### Install iOS Assets

**Manual approach:**

1. In Xcode, select `ios/App/App/Assets.xcassets`
2. Right-click on `AppIcon` → Delete
3. Drag the downloaded `AppIcon.appiconset` folder into Assets.xcassets
4. For splash screen:
   - Click `+` → New Image Set
   - Name it "Splash"
   - Drag splash image to 1x slot

**Or use command line:**

```bash
# Copy generated iOS icons
cp -r path/to/downloaded/AppIcon.appiconset ios/App/App/Assets.xcassets/

# Add splash screen
cp path/to/splash.png ios/App/App/Assets.xcassets/Splash.imageset/
```

#### Install Android Assets

**Copy generated assets:**

```bash
# Android icons (copy each mipmap folder)
cp -r path/to/downloaded/mipmap-* android/app/src/main/res/

# Android adaptive icons (if generated)
cp -r path/to/downloaded/mipmap-anydpi-v26 android/app/src/main/res/
```

**Splash screen for Android:**

Create: `android/app/src/main/res/drawable/splash.png`
- Use 1080×1920 image (standard phone resolution)
- Will be scaled for different screen sizes

#### Configure Splash Screen

**iOS (update Info.plist):**

```xml
<key>UILaunchScreen</key>
<dict>
    <key>UIImageName</key>
    <string>Splash</string>
    <key>UIColorName</key>
    <string>SplashBackground</string>
</dict>
```

**Android (update MainActivity):**

`android/app/src/main/java/com/sunshinetherapydogs/app/MainActivity.java`

```java
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Show splash screen
    SplashScreen.show(this, R.style.AppTheme_NoActionBar);
  }
}
```

---

## Platform-Specific Configuration

### iOS: Handling Safe Areas (Notch)

Your app already has viewport configured for notches, but need to ensure it works in iOS WebView.

**Add to your global CSS or layout:**

```css
/* Already in your app, verify it's present */
body {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
          env(safe-area-inset-bottom) env(safe-area-inset-left);
}
```

**In capacitor.config.ts (already set):**

```typescript
ios: {
  contentInset: 'always',
}
```

### Android: Handling Keyboard

**Update capacitor.config.ts:**

```typescript
plugins: {
  Keyboard: {
    resize: 'body',  // Resize when keyboard appears
    style: 'dark',   // Match your app theme
    resizeOnFullScreen: true,
  },
}
```

**Test areas:**
- Chat message input
- Login forms
- Appointment booking forms
- Profile editing

### Stream Chat WebSocket in Native

Stream Chat should work automatically, but verify connection handling:

**In your StreamChatClientManager, add device detection:**

```typescript
// Detect if running in native app
const isNativeApp = () => {
  return (window as any).Capacitor !== undefined;
};

// Use in connection logic
if (isNativeApp()) {
  console.log('Running in native Capacitor app');
  // May need different timeouts or retry logic
}
```

**Test specifically:**
- Background/foreground transitions
- Network switching (WiFi to cellular)
- App reopening after hours of inactivity

### Clerk Authentication in Native

Clerk should work with configured deep links, but test:

**OAuth flow:**
1. User taps "Sign In"
2. Opens browser (in-app or external)
3. User completes OAuth
4. Redirects back via `sunshinetherapydogs://oauth-callback`
5. App handles redirect and completes authentication

**If issues occur:**
- Verify deep link configuration (done above)
- Check Clerk Dashboard redirect URLs
- May need to use Clerk's Capacitor plugin if available

### Push Notifications Setup (Future)

**Not needed for initial release**, but here's how to set up later:

**iOS:**
1. Generate APNs certificate in Apple Developer Portal
2. Upload to Stream Chat dashboard (if using Stream for push)
3. Register device token in app

**Android:**
1. Set up Firebase Cloud Messaging (FCM)
2. Add `google-services.json` to Android project
3. Configure FCM in Stream Chat dashboard

**Code:**
```typescript
import { PushNotifications } from '@capacitor/push-notifications';

// Request permission
await PushNotifications.requestPermissions();

// Register with platform
await PushNotifications.register();

// Handle tokens
PushNotifications.addListener('registration', (token) => {
  console.log('Push token:', token.value);
  // Send to Stream Chat or your backend
});
```

---

## Testing Strategy

### Phase 1: Simulator/Emulator Testing

**Before testing on real devices, test in simulators:**

#### iOS Simulator Testing

```bash
# Build and run in simulator
npm run cap:run:ios
```

**In Xcode:**
1. Select simulator from device dropdown (e.g., "iPhone 15 Pro")
2. Click "Run" button (▶️) or press Cmd+R
3. Wait for build and app launch (~30 seconds first time)

**Test checklist:**
- [ ] App launches without crashes
- [ ] Authentication (Clerk) works
- [ ] Can view appointments
- [ ] Can send chat messages (Stream Chat)
- [ ] Images load (dog profiles, user avatars)
- [ ] Calendar/availability displays correctly
- [ ] Forms work (create appointment, etc.)
- [ ] Navigation works
- [ ] No console errors in Safari Web Inspector

**Debug in Safari:**
1. Open Safari on Mac
2. Safari → Develop → Simulator → localhost
3. Inspect web content, check console

#### Android Emulator Testing

```bash
# Start emulator first
emulator -avd Pixel_6_API_33  # Or your emulator name

# In another terminal, build and run
npm run cap:run:android
```

**Or in Android Studio:**
1. Click "Run" button (▶️)
2. Select emulator from device dropdown
3. Wait for build (~1-2 minutes first time)

**Test checklist:**
- [ ] Same checklist as iOS above
- [ ] Test back button behavior
- [ ] Test keyboard behavior with forms
- [ ] Test permissions dialogs (camera, notifications)

**Debug in Chrome:**
1. Open Chrome on computer
2. Go to `chrome://inspect`
3. Find your device/emulator
4. Click "Inspect"

---

### Phase 2: Physical Device Testing

**CRITICAL: Always test on real devices before submitting**

Simulators don't catch:
- Performance issues
- Real network conditions
- Touch gestures
- Camera/photo upload
- Push notifications
- Background behavior

#### iOS Device Testing

**Requirements:**
- Apple Developer Account
- iOS device with cable
- Device registered in Developer Portal

**Setup:**

1. **Register device in Apple Developer Portal:**
   - Go to https://developer.apple.com/account/resources/devices
   - Click "+" to add device
   - Enter device name and UDID
   - To find UDID: Connect device → Xcode → Window → Devices and Simulators

2. **In Xcode:**
   - Connect device via cable
   - Select your device from dropdown
   - Click "Run" (▶️)
   - May prompt to "Trust this computer" on device
   - App installs and launches

**Test with different scenarios:**
- Slow WiFi connection
- Cellular data only
- Airplane mode → reconnection
- Background app → foreground
- Kill app → reopen (preserves login?)
- After hours of inactivity

#### Android Device Testing

**Setup:**

1. **Enable Developer Options on device:**
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times
   - Developer Options now available

2. **Enable USB Debugging:**
   - Settings → Developer Options
   - Enable "USB Debugging"

3. **Connect device:**
   - Connect via USB cable
   - Accept "Allow USB debugging" prompt on device
   - Verify: `adb devices` should list your device

4. **In Android Studio:**
   - Select your device from dropdown
   - Click "Run" (▶️)
   - App installs and launches

**Test same scenarios as iOS**

---

### Phase 3: Beta Testing (TestFlight & Play Internal Testing)

**When to start beta testing:**
- After thorough simulator/emulator testing
- After testing on at least one physical device per platform
- When core features work reliably
- Before public release

#### iOS Beta (TestFlight)

**Setup in App Store Connect:**

1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → Create new app → "+" button
3. Fill in app information:
   - **Platform:** iOS
   - **Name:** Sunshine Therapy Dogs
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** Select `com.sunshinetherapydogs.app`
   - **SKU:** `sunshine-therapy-dogs-001` (any unique identifier)
   - **User Access:** Full Access

4. Navigate to TestFlight tab
5. Click "Internal Testing" or "External Testing"

**Upload build to TestFlight:**

We'll cover build process in next section, but overview:
1. Archive app in Xcode
2. Upload to App Store Connect
3. Wait for processing (~10 minutes)
4. Add to TestFlight group
5. Invite testers via email

**Invite testers:**
- Add emails in TestFlight section
- Create public link for easier invitations
- Testers receive email → Install TestFlight app → Install your app

#### Android Beta (Play Internal Testing)

**Setup in Play Console:**

1. Go to https://play.google.com/console
2. Click "Create app"
3. Fill in app details:
   - **App name:** Sunshine Therapy Dogs
   - **Default language:** English (United States)
   - **App or game:** App
   - **Free or paid:** Free
4. Complete content declarations (privacy policy, etc.)

5. Navigate to Testing → Internal testing
6. Create new release

**Upload build:**

We'll cover build process in next section, but overview:
1. Build signed APK/AAB in Android Studio
2. Upload to Play Console
3. Add release notes
4. Review and roll out

**Invite testers:**
- Create email list or use Google Group
- Add testers in Internal testing section
- They receive opt-in link
- Install directly from Play Store

---

### What to Test During Beta

**Critical user flows:**
1. **Registration & Authentication**
   - [ ] Sign up as new user
   - [ ] Sign in with existing account
   - [ ] Sign out
   - [ ] Password reset
   - [ ] OAuth providers (if enabled)

2. **Role-Specific Flows**
   - [ ] Complete profile (individual vs volunteer)
   - [ ] Upload dog profile (volunteer)
   - [ ] Browse available volunteers (individual)
   - [ ] Set availability (volunteer)
   - [ ] Book appointment (individual)
   - [ ] Receive appointment (volunteer)

3. **Chat System**
   - [ ] Send message
   - [ ] Receive message (test with second device)
   - [ ] Unread count updates
   - [ ] Chat persists after app restart
   - [ ] Reconnection after network loss

4. **Appointments**
   - [ ] View calendar
   - [ ] Create appointment
   - [ ] Modify appointment
   - [ ] Cancel appointment
   - [ ] Receive notifications (email)

5. **Edge Cases**
   - [ ] Poor network connection
   - [ ] App backgrounded during operation
   - [ ] App killed mid-process
   - [ ] Multiple rapid actions
   - [ ] Large data sets (many appointments)

**Gather feedback:**
- Use TestFlight's built-in feedback system (iOS)
- Create Google Form for Android testers
- Monitor crash reports in App Store Connect / Play Console

---

## Build & Deployment Workflows

### iOS Build Process

#### Development Build (For Testing)

**Quick method (simulator only):**
```bash
npm run cap:run:ios
```

**For device testing:**

1. Open Xcode: `npm run cap:open:ios`
2. Select your device from dropdown
3. Click Run (▶️)
4. App installs directly

#### TestFlight Build (For Beta Testers)

**Step-by-step:**

1. **Sync latest changes:**
   ```bash
   npm run cap:sync:ios
   ```

2. **Open in Xcode:**
   ```bash
   npm run cap:open:ios
   ```

3. **Select "Any iOS Device (arm64)"** from device dropdown

4. **Archive the app:**
   - Product → Archive (or Shift+Cmd+B)
   - Wait for build (~2-5 minutes)
   - Organizer window opens automatically

5. **Distribute to TestFlight:**
   - Click "Distribute App"
   - Select "App Store Connect"
   - Click "Upload"
   - Select distribution certificate (auto-managed if you chose automatic signing)
   - Click "Upload"
   - Wait for processing (~5-15 minutes)

6. **In App Store Connect:**
   - Go to TestFlight tab
   - New build appears (after processing)
   - Click on build
   - Add to testing group
   - Testers notified automatically

**Build versioning:**
- **Version:** `0.1.0` (from package.json) - User-facing version
- **Build Number:** Auto-increments (1, 2, 3...) - Internal tracking
  - Set in Xcode → General → Build number
  - Or let Xcode auto-increment

**First time:** ~15-20 minutes total
**Subsequent builds:** ~8-10 minutes

#### Production Build (For App Store)

**Same process as TestFlight**, but:

1. After upload, go to App Store Connect
2. Click "App Store" tab (not TestFlight)
3. Click "+" to create new version
4. Fill in:
   - Version number: 1.0.0 (your first production release)
   - What's New: Release notes
   - Screenshots (required - see section below)
   - App description
   - Keywords
   - Support URL
   - Privacy policy URL

5. Select the build you uploaded
6. Complete all required fields
7. Click "Submit for Review"
8. Wait for review (~1-7 days, average 1-2 days)

**Screenshots required:**
- iPhone 6.7" display (iPhone 14 Pro Max)
- iPhone 5.5" display (iPhone 8 Plus)
- iPad Pro 12.9" (3rd gen)

Can use Simulator + Cmd+S to capture screenshots.

---

### Android Build Process

#### Development Build (For Testing)

**Quick method (emulator):**
```bash
npm run cap:run:android
```

**For device testing:**

1. Open Android Studio: `npm run cap:open:android`
2. Select your device from dropdown
3. Click Run (▶️)
4. App installs directly

#### Generate Signing Key (First Time Only)

**Android requires signed builds for distribution:**

```bash
# Navigate to android folder
cd android

# Generate keystore (do this ONCE - keep this file safe!)
keytool -genkey -v -keystore sunshine-release-key.keystore -alias sunshine-key -keyalg RSA -keysize 2048 -validity 10000

# You'll be prompted for:
# - Keystore password (SAVE THIS - you'll need it forever)
# - Key password (SAVE THIS)
# - Your name, organization, etc.
```

**CRITICAL:**
- **Back up this keystore file** - If lost, you can never update your app
- **Save passwords** - Store in password manager
- **Never commit to git** - Add to .gitignore

**Add to .gitignore:**
```
android/sunshine-release-key.keystore
android/key.properties
```

**Configure signing in Android Studio:**

Create: `android/key.properties`

```properties
storeFile=/absolute/path/to/sunshine-release-key.keystore
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=sunshine-key
keyPassword=YOUR_KEY_PASSWORD
```

**Update `android/app/build.gradle`:**

```gradle
// Add before android block
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...

    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

#### Internal Testing Build

1. **Sync latest changes:**
   ```bash
   npm run cap:sync:android
   ```

2. **Build signed AAB:**
   ```bash
   cd android
   ./gradlew bundleRelease
   ```

   **Output:** `android/app/build/outputs/bundle/release/app-release.aab`

3. **Upload to Play Console:**
   - Go to Play Console → Your App
   - Testing → Internal testing → Create release
   - Upload `app-release.aab`
   - Add release notes: "Beta build - [what's new]"
   - Review and roll out to internal testing

4. **Notify testers:**
   - They receive email with opt-in link
   - Install from Play Store

**Build time:** ~3-5 minutes

#### Production Build

**Same process as Internal Testing**, but:

1. Build signed AAB (same command)
2. In Play Console:
   - Production → Create new release
   - Upload AAB
   - Fill in release notes
   - Complete store listing (if first time):
     - App name, description
     - Screenshots (required sizes)
     - Feature graphic (1024×500)
     - App icon (512×512)
     - Privacy policy URL
     - Category
   - Submit for review

3. Choose rollout strategy:
   - **Staged rollout:** 10% → 50% → 100% (recommended)
   - **Full rollout:** 100% immediately

**Review time:** Usually 1-3 days, sometimes hours

**Screenshots required:**
- Phone: 1080×1920 minimum (at least 2 screenshots)
- 7-inch tablet: Optional but recommended
- 10-inch tablet: Optional but recommended

---

### Automated Build Scripts (Optional)

**Create these scripts for faster builds:**

**`scripts/build-ios.sh`:**
```bash
#!/bin/bash
set -e

echo "Building Next.js..."
npm run build

echo "Syncing to iOS..."
npx cap sync ios

echo "Opening Xcode..."
npx cap open ios

echo "✅ Ready to archive in Xcode"
```

**`scripts/build-android.sh`:**
```bash
#!/bin/bash
set -e

echo "Building Next.js..."
npm run build

echo "Syncing to Android..."
npx cap sync android

echo "Building signed AAB..."
cd android && ./gradlew bundleRelease

echo "✅ AAB ready: android/app/build/outputs/bundle/release/app-release.aab"
```

**Make executable:**
```bash
chmod +x scripts/build-ios.sh
chmod +x scripts/build-android.sh
```

**Usage:**
```bash
./scripts/build-ios.sh   # Then archive in Xcode
./scripts/build-android.sh  # AAB ready to upload
```

---

### Using Fastlane (Advanced Automation)

**Fastlane** automates building and uploading.

**Installation:**
```bash
# Install Fastlane
sudo gem install fastlane -NV

# Initialize for iOS
cd ios
fastlane init

# Initialize for Android
cd ../android
fastlane init
```

**Example iOS Fastfile:**

```ruby
platform :ios do
  desc "Push a new beta build to TestFlight"
  lane :beta do
    increment_build_number(xcodeproj: "App/App.xcodeproj")
    build_app(workspace: "App/App.xcworkspace", scheme: "App")
    upload_to_testflight
  end
end
```

**Usage:**
```bash
cd ios
fastlane beta  # Builds and uploads to TestFlight automatically
```

**Benefit:** One command instead of 10 manual steps

**Setup time:** ~2-3 hours first time, saves hours long-term

---

## Version Management

### Semantic Versioning Strategy

**Use format:** `MAJOR.MINOR.PATCH`

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes, major redesign
- **MINOR** (1.0.0 → 1.1.0): New features, non-breaking changes
- **PATCH** (1.0.0 → 1.0.1): Bug fixes only

**Example timeline:**
- `0.1.0` - Initial beta (current)
- `0.2.0` - Add push notifications
- `0.3.0` - Add favorites feature
- `1.0.0` - First public release
- `1.0.1` - Fix chat bug
- `1.1.0` - Add video calls
- `2.0.0` - Complete redesign

### Keeping Versions in Sync

**Single source of truth:** `package.json`

```json
{
  "version": "0.1.0"
}
```

**Update all platforms when changing version:**

```bash
# Update version
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.1 → 0.2.0
npm version major  # 0.2.0 → 1.0.0

# Then manually update native projects:
```

**iOS: Update in Xcode**
- Open `ios/App/App.xcodeproj`
- Select App target
- General tab
- Version: `0.1.0` (matches package.json)
- Build: Auto-increment (1, 2, 3...)

**Android: Update build.gradle**

```gradle
defaultConfig {
    versionCode 1       // Increment with each release (1, 2, 3...)
    versionName "0.1.0" // Match package.json
}
```

**Build numbers vs Version numbers:**
- **Version (0.1.0):** User-facing, shows in app store
- **Build (1, 2, 3...):** Internal tracking, must always increase

**Example:**
- Release 0.1.0 - Build 1
- Release 0.1.0 - Build 2 (bug fix, same version, new build)
- Release 0.1.1 - Build 3 (new version, new build)

### Git Tagging

**Tag releases in git:**

```bash
git tag -a v0.1.0 -m "Initial beta release"
git push origin v0.1.0
```

**Benefits:**
- Easy to find code for specific release
- Can checkout old versions if needed
- Clear history of releases

---

## Release Schedule & Strategy

### Beta Phase (Current - ~2-3 months)

**Web (Vercel):**
- Deploy: As often as needed (multiple times daily if needed)
- No restrictions

**iOS (TestFlight):**
- Deploy: 2-3 times per week (Monday, Wednesday, Friday)
- Batch minor changes together
- Critical fixes go out immediately
- External TestFlight (for beta testers)

**Android (Play Internal Testing):**
- Deploy: 2-3 times per week (match iOS schedule)
- Can be more frequent (reviews are fast)
- Internal Testing track

**Weekly workflow:**

**Monday:**
- Review changes from previous week
- Deploy to Vercel throughout the day as changes made
- End of day: Build and upload to TestFlight + Play Internal Testing

**Tuesday-Thursday:**
- Continue development
- Deploy to Vercel as needed
- Monitor TestFlight/Play feedback

**Friday:**
- Fix any critical issues found during week
- Build and upload to TestFlight + Play Internal Testing
- Review beta tester feedback
- Plan next week's features

**Emergency fixes:**
- Deploy to Vercel immediately
- Build native apps same day if critical
- Communicate with beta testers

### Public Release Phase (After Beta)

**Web (Vercel):**
- Deploy: As often as needed (unchanged)
- Use as "canary" - test changes on web first

**iOS (App Store Production):**
- Scheduled releases: Every **2-4 weeks**
- Batched non-critical changes
- Submit Sunday evening → Approved by Tuesday (hopefully)
- Emergency fixes: Use Expedited Review (sparingly - only 2-3 per year)

**Android (Play Store Production):**
- Scheduled releases: Every **1-2 weeks**
- More frequent than iOS (faster review)
- Staged rollout: 10% (day 1) → 50% (day 3) → 100% (day 7)
- Emergency fixes: Submit immediately (usually approved in hours)

**Monthly release cycle example:**

**Week 1:**
- Development on new features
- Deploy to web continuously
- Monitor analytics and bug reports

**Week 2:**
- Continue development
- Begin testing new features on web
- Internal testing with team

**Week 3:**
- Code freeze for native apps
- Thorough testing on simulators/emulators
- Test on physical devices
- Fix any found issues

**Week 4:**
- Build and submit to App Store (Monday)
- Build and submit to Play Store (Tuesday)
- Monitor reviews
- If approved, announce update to users
- Start next cycle

### Update Types & Priorities

**Immediate (same day):**
- Critical bug causing crashes
- Security vulnerability
- Payment/transaction issues
- Data loss issues
- Authentication broken

**High Priority (within 3 days):**
- Important bugs affecting many users
- Features not working as expected
- Performance issues
- Minor security concerns

**Normal (next scheduled release):**
- Small bugs affecting few users
- UI tweaks
- New features
- Enhancements
- Typos, copy changes

**Low Priority (when convenient):**
- Nice-to-have features
- Experimental features
- Refactoring
- Internal improvements

### Communication with Users

**Beta Phase:**
- Update beta testers regularly
- Use TestFlight release notes field
- Send email updates for major changes
- Request feedback actively

**Public Release:**
- Write clear release notes for each update
- Highlight new features
- Mention important bug fixes
- Be transparent about issues
- Announce updates on website/social media

**Example release notes:**

```
Version 1.1.0 - What's New

NEW FEATURES
• Added favorite volunteers - bookmark your preferred therapy dogs
• Enhanced chat with read receipts
• New appointment reminders via email

IMPROVEMENTS
• Faster app loading time
• Better image quality for dog profiles
• Improved calendar navigation

BUG FIXES
• Fixed issue where chat messages weren't sending on slow connections
• Corrected timezone display for appointments
• Resolved crash when uploading large images

Thank you to our beta testers for the feedback!
```

---

## Troubleshooting

### Common Issues During Setup

#### Xcode Build Errors

**Error: "No signing certificate found"**

**Solution:**
1. Xcode → Settings → Accounts
2. Add Apple ID
3. Select team
4. Click "Manage Certificates"
5. Click "+" → Apple Development
6. In project, check "Automatically manage signing"

---

**Error: "Bundle identifier already in use"**

**Solution:**
- Change bundle ID in capacitor.config.ts
- Resync: `npx cap sync ios`
- Update in Xcode if needed

---

**Error: "CocoaPods not installed"**

**Solution:**
```bash
sudo gem install cocoapods
cd ios/App
pod install
```

---

#### Android Build Errors

**Error: "SDK location not found"**

**Solution:**
Create `android/local.properties`:
```properties
sdk.dir=/Users/USERNAME/Library/Android/sdk
```

Replace USERNAME with your actual username.

---

**Error: "Gradle build failed"**

**Solution:**
```bash
cd android
./gradlew clean
./gradlew build
```

---

**Error: "Unable to locate adb"**

**Solution:**
- Install Android SDK Platform-Tools in Android Studio
- Add to PATH (see Development Environment Setup section)

---

### Runtime Issues

#### Clerk Authentication Not Working

**Symptoms:** OAuth redirects fail, stuck on login screen

**Debugging:**
1. Check deep link configuration (iOS Info.plist, Android AndroidManifest.xml)
2. Verify Clerk Dashboard has correct redirect URLs
3. Check console for errors
4. Test on physical device (simulators may not handle deep links properly)

**Solution:**
- Add URL scheme to both platforms
- Update Clerk Dashboard settings
- Test deep link with: `xcrun simctl openurl booted sunshinetherapydogs://test`

---

#### Stream Chat Not Connecting

**Symptoms:** Messages don't send, "Connecting..." status forever

**Debugging:**
1. Check WebSocket support in WebView
2. Verify internet connection
3. Check Stream Chat API credentials
4. Look for CORS errors

**Solution:**
- Ensure `androidScheme: 'https'` in capacitor.config.ts
- Check Stream Chat token generation on server
- Verify network permissions in AndroidManifest.xml
- Test reconnection logic

---

#### Images Not Loading

**Symptoms:** Broken image icons, dog profiles show placeholders

**Debugging:**
1. Check image URLs (are they relative or absolute?)
2. Verify Supabase storage permissions
3. Check Content Security Policy
4. Look for mixed content warnings (HTTP vs HTTPS)

**Solution:**
- Use absolute URLs for all external images
- Verify Supabase storage bucket is public
- Update CSP headers if needed
- For Next.js images, ensure `unoptimized: true` in config

---

#### App Crashes on Launch

**Symptoms:** App opens, immediately closes

**Debugging:**
1. Check device logs:
   - iOS: Xcode → Window → Devices and Simulators → View Device Logs
   - Android: `adb logcat`
2. Look for JavaScript errors in console
3. Check for missing dependencies

**Solution:**
- Verify all Capacitor plugins installed
- Check for console errors
- Rebuild from clean state: `npm run cap:sync`
- Test in simulator first, then device

---

#### White Screen After Launch

**Symptoms:** App opens to white screen, nothing loads

**Debugging:**
1. Open Safari/Chrome DevTools (see Testing section)
2. Check console for errors
3. Verify webDir points to correct build output
4. Check if Next.js build succeeded

**Solution:**
- Confirm `capacitor.config.ts` `server.url` is correct (prod vs staging) and uses HTTPS.
- Test that the URL loads normally in Safari/Chrome on the same device.
- If using self-signed certs for staging, add them to the device or use ngrok with HTTPS.
- Run `npx cap sync` after changing config so native projects pick up the new URL.

---

### App Store Submission Issues

#### iOS: App Rejected for Missing Functionality

**Reason:** Apple requires apps to be more than just wrappers

**Prevention:**
- Ensure app has meaningful offline functionality
- Add native features (push notifications, camera)
- Provide clear value beyond website

**Response:**
- Explain native features in App Review notes
- Highlight push notifications, native camera integration
- Emphasize offline capability

---

#### iOS: Privacy Policy Required

**Reason:** App collects user data

**Solution:**
- Create privacy policy page
- Add URL to App Store Connect
- Include in app (Settings → Privacy Policy link)

---

#### Android: Permissions Too Broad

**Reason:** Requesting unnecessary permissions

**Solution:**
- Review AndroidManifest.xml
- Remove unused permissions
- Add explanations in app description

---

### Performance Issues

#### Slow App Loading

**Symptoms:** Takes 5+ seconds to show content

**Debugging:**
1. Check Next.js build size
2. Measure with Chrome DevTools Performance tab
3. Check for large images or assets

**Solution:**
- Optimize images (compress, WebP format)
- Code splitting in Next.js
- Lazy load components
- Use Capacitor SplashScreen to hide slow loading

---

#### Chat Lag or Delays

**Symptoms:** Messages take seconds to appear

**Debugging:**
1. Check network connection
2. Test Stream Chat dashboard (are messages reaching server?)
3. Profile JavaScript performance

**Solution:**
- Review Stream Chat client configuration
- Reduce unnecessary re-renders in React
- Check for memory leaks
- Test on different network conditions

---

## Maintenance & Updates

### Regular Maintenance Tasks

**Weekly:**
- [ ] Monitor crash reports (App Store Connect, Play Console)
- [ ] Review user feedback and ratings
- [ ] Check analytics for errors or unusual patterns
- [ ] Update dependencies if security patches available

**Monthly:**
- [ ] Review and update Capacitor plugins
- [ ] Test on latest iOS/Android versions
- [ ] Update Node dependencies: `npm outdated`
- [ ] Review and optimize app size

**Quarterly:**
- [ ] Test on newest devices (new iPhone, Android flagship)
- [ ] Review and update privacy policy if needed
- [ ] Audit permissions (remove unused)
- [ ] Performance optimization review

**Annually:**
- [ ] Renew Apple Developer Account ($99)
- [ ] Update screenshots if UI changed significantly
- [ ] Review app description and keywords
- [ ] Major Capacitor version upgrades

### Updating Capacitor

**Check for updates:**
```bash
npm outdated | grep @capacitor
```

**Update Capacitor:**
```bash
# Update all Capacitor packages
npm install @capacitor/core@latest @capacitor/cli@latest
npm install @capacitor/ios@latest @capacitor/android@latest
npm install @capacitor/camera@latest # etc for all plugins

# Sync changes
npm run cap:sync

# Test thoroughly
```

**Breaking changes:** Always read release notes before major version updates

### Updating Next.js

**Check current version:**
```bash
npm list next
```

**Update:**
```bash
npm install next@latest react@latest react-dom@latest

# Test build
npm run build

# Test in Capacitor
npm run cap:sync
```

**Watch for:** Middleware/auth changes that might affect running inside a WebView

### Monitoring App Health

**iOS (App Store Connect):**
- Crashes and Hangs report
- Diagnostics → Crashes
- Filter by version to see if new issues introduced

**Android (Play Console):**
- Quality → Android Vitals
- Crashes & ANRs (Application Not Responding)
- Filter by version

**Set up alerts:**
- Email notifications for crashes above threshold
- Slack/Discord webhooks for critical issues

**Analytics recommendations:**
- Add analytics SDK (PostHog, Mixpanel, etc.)
- Track:
  - App opens
  - Feature usage (appointments created, messages sent)
  - Error rates
  - User retention
  - Screen views

### Handling User Feedback

**App Store Reviews:**
- Respond to reviews (shows you care)
- Address common complaints in updates
- Thank positive reviewers

**TestFlight Feedback:**
- Review regularly
- Prioritize issues mentioned by multiple testers
- Communicate fixes back to testers

**Direct Support:**
- Add support email in app
- Respond to user issues
- Keep track of common problems

---

## Appendix: Quick Reference

### Essential Commands

```bash
# Development
npm run dev                    # Run Next.js dev server
npm run build                 # Production build sanity check
npm run native:sync           # Sync Capacitor config + assets to native projects

# iOS
npm run cap:open:ios          # Open in Xcode
npm run cap:run:ios           # Build and run in simulator
./scripts/build-ios.sh        # Prepare for TestFlight

# Android
npm run cap:open:android      # Open in Android Studio
npm run cap:run:android       # Build and run in emulator
./scripts/build-android.sh    # Build signed AAB

# Maintenance
npm outdated                  # Check for updates
npx cap sync                  # Sync web to native
npx cap doctor                # Diagnose issues
```

### File Locations

```
Important configuration files:

capacitor.config.ts            # Main Capacitor config
next.config.ts                 # Next.js config (shared across web/mobile)
package.json                   # Version source of truth

iOS:
ios/App/App/Info.plist        # iOS permissions and settings
ios/App/App/Assets.xcassets   # Icons and images

Android:
android/app/src/main/AndroidManifest.xml    # Permissions
android/app/build.gradle                     # Version and signing
android/app/src/main/res/                    # Icons and images
```

### Resource Links

**Official Documentation:**
- Capacitor: https://capacitorjs.com/docs
- Next.js Deployment Overview: https://nextjs.org/docs/app/building-your-application/deploying
- Apple Developer: https://developer.apple.com
- Google Play: https://developer.android.com/distribute

**App Store Connect:**
- iOS: https://appstoreconnect.apple.com
- Android: https://play.google.com/console

**Testing:**
- TestFlight: Built into App Store Connect
- Play Internal Testing: Built into Play Console

**Tools:**
- App Icon Generator: https://www.appicon.co/
- Fastlane: https://fastlane.tools/
- Screenshot Framer: https://www.screely.com/

### Support Contacts

**Capacitor Issues:**
- GitHub: https://github.com/ionic-team/capacitor/issues
- Discord: https://ionic.link/discord

**App Store Issues:**
- Apple Developer Forums: https://developer.apple.com/forums/
- App Review: https://developer.apple.com/contact/app-store/

**Play Store Issues:**
- Google Play Support: https://support.google.com/googleplay/android-developer

---

## Next Steps

### Getting Started Checklist

**Before starting:**
- [ ] Read through entire document
- [ ] Sign up for Apple Developer Account
- [ ] Sign up for Google Play Developer Account
- [ ] Install Xcode (Mac only)
- [ ] Install Android Studio
- [ ] Back up current project

**Phase 1: Setup (Week 1)**
- [ ] Install Capacitor packages
- [ ] Initialize Capacitor
- [ ] Set Capacitor `server.url` to the hosted Sunshine domain
- [ ] Add iOS and Android platforms
- [ ] Test in simulators/emulators

**Phase 2: Configuration (Week 1-2)**
- [ ] Configure iOS project (signing, permissions, deep links)
- [ ] Configure Android project (permissions, signing key, deep links)
- [ ] Generate app icons and splash screens
- [ ] Test authentication flow
- [ ] Test chat functionality

**Phase 3: Testing (Week 2-3)**
- [ ] Test on physical iOS device
- [ ] Test on physical Android device
- [ ] Set up TestFlight
- [ ] Set up Play Internal Testing
- [ ] Invite beta testers
- [ ] Gather feedback

**Phase 4: Launch (Week 4+)**
- [ ] Fix issues found in beta
- [ ] Prepare screenshots and store listings
- [ ] Submit to App Store
- [ ] Submit to Play Store
- [ ] Wait for approval
- [ ] Announce launch!

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-11
**Maintained By:** Claude Code (for future reference)

**Related Documentation:**
- [CLAUDE.md](./CLAUDE.md) - Main development guide
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database structure
- [CHAT_SYSTEM_DOCUMENTATION.md](./CHAT_SYSTEM_DOCUMENTATION.md) - Stream Chat implementation

---

*This guide is comprehensive but not exhaustive. Mobile development has many edge cases. When in doubt, consult official Capacitor documentation and platform-specific guides. Test thoroughly before releasing.*
