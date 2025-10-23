# 🚀 Render.com Deployment Guide

## Setting Up Environment Variables on Render

The feedback system requires email credentials to be set as environment variables on Render.com.

### Step-by-Step Guide:

1. **Go to your Render Dashboard:**
   - Visit: https://dashboard.render.com/
   - Select your `scrum-game` service

2. **Navigate to Environment Variables:**
   - Click on **Environment** tab in the left sidebar
   - Or go directly to: `https://dashboard.render.com/web/YOUR-SERVICE-ID`

3. **Add Environment Variables:**

   Click **"Add Environment Variable"** and add these two variables:

   **Variable 1:**
   ```
   Key: EMAIL_USER
   Value: your.email@gmail.com
   ```

   **Variable 2:**
   ```
   Key: EMAIL_PASS
   Value: your-gmail-app-password-here
   ```

   **Variable 3 (Optional):**
   ```
   Key: EMAIL_RECIPIENT
   Value: feedback@yourcompany.com
   ```

   ⚠️ **SECURITY NOTE:**
   - Replace values with your actual Gmail credentials
   - EMAIL_PASS: 16 characters, no spaces
   - EMAIL_RECIPIENT: Where feedback emails will be sent (defaults to EMAIL_USER if not set)

4. **Save Changes:**
   - Click **"Save Changes"**
   - Render will automatically redeploy your service with the new environment variables

5. **Wait for Deployment:**
   - The deployment usually takes 2-3 minutes
   - Check the **Logs** tab to see if deployment was successful

---

## Verifying Email Setup

### Step 1: Check Server Startup Logs

After deployment, check **Render Logs** immediately. You should see:

**✅ Successful Configuration:**
```
Server listening on port 3000

📧 Email Configuration:
   EMAIL_USER: your.email@gmail.com
   EMAIL_PASS: ***ufyt
   EMAIL_RECIPIENT: feedback@yourcompany.com
   Testing SMTP connection...
   ✅ SMTP connection successful!
```

**❌ If SMTP Connection Fails:**
```
Server listening on port 3000

📧 Email Configuration:
   EMAIL_USER: your.email@gmail.com
   EMAIL_PASS: ***ufyt
   EMAIL_RECIPIENT: feedback@yourcompany.com
   Testing SMTP connection...
   ❌ SMTP connection failed: Invalid login
   Error code: EAUTH
   This may cause email sending to fail.
```

**⚠️ If Environment Variables Not Set:**
```
Server listening on port 3000

⚠️ Email not configured (EMAIL_USER and/or EMAIL_PASS not set)
   Feedback will be logged to console only.
```

### Step 2: Test Feedback Submission

1. Visit your Render app: `https://scrum-game-ckpj.onrender.com/`
2. Click the **Feedback** button (bottom left)
3. Fill out and submit the form
4. Check **Render Logs** for:
   ```
   === NEW FEEDBACK RECEIVED ===
   Timestamp: 2025-10-23T18:38:42.183Z
   Rating: 4 / 5 stars
   Email: user@example.com
   Room: test-room
   Message: Great app!
   ============================

   📧 Attempting to send email...
      From: your.email@gmail.com
      To: feedback@yourcompany.com
      Rating: 4 stars
   ✅ Email sent successfully: 250 2.0.0 OK
      Message ID: <abc123@gmail.com>
   ```

---

## Important Notes

- **No .env file needed on Render** - Environment variables are managed through the dashboard
- **Feedback still works without email** - If email fails, feedback is still logged to console
- **Emails send in background** - Users don't wait for email to send (instant response)
- **30-second timeout** - If Gmail doesn't respond in 30 seconds, the email fails gracefully
- **SMTP connection tested on startup** - Server verifies email config when it starts

---

## Troubleshooting

### 1. SMTP Connection Failed at Startup

**Error in logs:**
```
❌ SMTP connection failed: Invalid login
Error code: EAUTH
```

**Solutions:**
- Gmail App Password is incorrect or expired
- Go to https://myaccount.google.com/apppasswords
- Delete old app password and generate a new one
- Update `EMAIL_PASS` on Render with new password (no spaces)

---

### 2. Email Timeout (30 seconds)

**Error in logs:**
```
❌ Error sending email: Email timeout after 30 seconds
```

**Possible causes:**
- Render.com may be blocking outbound SMTP connections
- Gmail SMTP server is slow or unresponsive
- Network connectivity issues

**Solutions:**
- Wait a few minutes and try again (Gmail may be rate-limiting)
- Check if Render's IP is blocked by Google (rare)
- Feedback is still logged to console, so data is not lost

---

### 3. Invalid Email Credentials

**Error in logs:**
```
❌ Error sending email: Invalid login
Error code: EAUTH
```

**Solutions:**
- Double-check `EMAIL_USER` matches Gmail account
- Verify `EMAIL_PASS` is App Password (NOT your Gmail password)
- Make sure 2FA is enabled on Gmail account
- No extra spaces or quotes in environment variables

---

### 4. Environment Variables Not Set

**Error in logs:**
```
⚠️ Email not configured (EMAIL_USER and/or EMAIL_PASS not set)
```

**Solutions:**
- Go to Render Dashboard → Environment tab
- Add `EMAIL_USER` and `EMAIL_PASS` variables
- Click "Save Changes" (triggers automatic redeploy)
- Wait 2-3 minutes for deployment to complete

---

### 5. Email Sent But Not Received

**Logs show success but email not in inbox:**

**Solutions:**
1. Check spam/junk folder
2. Verify `EMAIL_RECIPIENT` is set correctly (or check EMAIL_USER)
3. Check Gmail "Sent" folder to confirm email was sent
4. Gmail may be delaying delivery (wait a few minutes)

---

## Current Setup Status

✅ **Feedback endpoint:** `/api/feedback`
✅ **Response time:** Instant (email sent in background)
✅ **SMTP config:** Port 587, TLS, 30s connection timeout
✅ **Email sending timeout:** 30 seconds
✅ **Startup verification:** SMTP connection tested on server start
✅ **Console logging:** Always enabled with detailed diagnostics
✅ **Graceful degradation:** Works without email credentials

---

## Console Logs You Should See

**When feedback is submitted:**
```
=== NEW FEEDBACK RECEIVED ===
Timestamp: 2025-10-23T18:20:00.000Z
Rating: 5 / 5 stars
Email: user@example.com
Room: test-room
Message: Great app!
============================

📧 Attempting to send email...
✅ Email sent successfully: 250 2.0.0 OK
```

**If email credentials not configured:**
```
=== NEW FEEDBACK RECEIVED ===
...
⚠️ Email credentials not configured - skipping email send
```

**If email timeout:**
```
=== NEW FEEDBACK RECEIVED ===
...
📧 Attempting to send email...
❌ Error sending email: Email timeout after 10 seconds
Feedback was logged but email failed to send
```
