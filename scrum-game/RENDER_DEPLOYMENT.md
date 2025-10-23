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
   Value: eray.buykor@gmail.com
   ```

   **Variable 2:**
   ```
   Key: EMAIL_PASS
   Value: your-gmail-app-password-here
   ```

   ⚠️ **SECURITY NOTE:** Replace `your-gmail-app-password-here` with your actual Gmail App Password (16 characters, no spaces)

4. **Save Changes:**
   - Click **"Save Changes"**
   - Render will automatically redeploy your service with the new environment variables

5. **Wait for Deployment:**
   - The deployment usually takes 2-3 minutes
   - Check the **Logs** tab to see if deployment was successful

---

## Verifying Email Setup

After deployment, test the feedback system:

1. Visit your Render app: `https://scrum-game-ckpj.onrender.com/`
2. Click the **Feedback** button (bottom left)
3. Fill out and submit the form
4. Check **Render Logs** for:
   ```
   === NEW FEEDBACK RECEIVED ===
   📧 Attempting to send email...
   ✅ Email sent successfully
   ```

If you see:
```
⚠️ Email credentials not configured - skipping email send
```

Then the environment variables weren't set correctly. Double-check the variable names and values.

---

## Important Notes

- **No .env file needed on Render** - Environment variables are managed through the dashboard
- **Feedback still works without email** - If email fails, feedback is still logged to console
- **Emails send in background** - Users don't wait for email to send (instant response)
- **10-second timeout** - If Gmail doesn't respond in 10 seconds, the email fails gracefully

---

## Troubleshooting

### Email not sending?

1. **Check Render Logs:**
   ```bash
   # Look for these messages:
   📧 Attempting to send email...
   ✅ Email sent successfully
   ```

2. **Verify Environment Variables:**
   - Go to Environment tab
   - Make sure `EMAIL_USER` and `EMAIL_PASS` are set correctly
   - No extra spaces or quotes

3. **Check Gmail App Password:**
   - Make sure the App Password is still valid
   - Regenerate if needed: https://myaccount.google.com/apppasswords

4. **Check Render Free Tier Limits:**
   - Free tier services spin down after 15 minutes of inactivity
   - First request after spin-up might be slow

---

## Current Setup Status

✅ **Feedback endpoint:** `/api/feedback`
✅ **Response time:** Instant (email sent in background)
✅ **Email timeout:** 10 seconds
✅ **Console logging:** Always enabled
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
