# Partner Realm

Partner Realm is a partner management system designed for GitHub hosting and Cloudflare Pages deployment. It uses a zero-build static frontend, while Supabase provides authentication, PostgreSQL, and screenshot storage.

## Features

- Google sign-in
- Email sign-up, sign-in, and password reset
- Admin console for partner creation and management
- Renewal status tracking for every partner
- Partner portal for uploading reading payment screenshots
- Admin review flow for approval or rejection

## Files

- [index.html](/c:/Users/Administrator/Downloads/PartnerRealm/index.html)
- [app.js](/c:/Users/Administrator/Downloads/PartnerRealm/app.js)
- [styles.css](/c:/Users/Administrator/Downloads/PartnerRealm/styles.css)
- [config.js](/c:/Users/Administrator/Downloads/PartnerRealm/config.js)
- [supabase/schema.sql](/c:/Users/Administrator/Downloads/PartnerRealm/supabase/schema.sql)
- [_redirects](/c:/Users/Administrator/Downloads/PartnerRealm/_redirects)

## Architecture

1. Store this project in a GitHub repository.
2. Connect the repository to Cloudflare Pages.
3. Use Supabase for Auth, Postgres, and Storage.
4. Bind your custom domain in Cloudflare and add the same domain to Supabase URL settings.

## Supabase Setup

1. Create a new Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](/c:/Users/Administrator/Downloads/PartnerRealm/supabase/schema.sql).
3. In `Authentication -> Providers`:
   - Enable `Email`
   - Enable `Google`
4. In `Authentication -> URL Configuration`, add:
   - `Site URL`: your production domain, for example `https://partner.example.com`
   - `Redirect URLs`: `https://partner.example.com`
5. In `Project Settings -> API`, copy:
   - `Project URL`
   - `anon public key`
6. Edit [config.js](/c:/Users/Administrator/Downloads/PartnerRealm/config.js) and replace:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `siteUrl`

## Create the First Admin

Register a normal account first, then run this SQL in Supabase:

```sql
update public.profiles
set role = 'admin'
where email = 'your-admin-email@example.com';
```

Sign out and back in. That account will enter the admin console.

## Cloudflare Pages Deployment

1. Create a GitHub repository, for example `partner-realm`.
2. Push this directory into that repository.
3. Open Cloudflare Dashboard.
4. Go to `Workers & Pages -> Create application -> Pages -> Connect to Git`.
5. Select the GitHub repository.
6. Use these build settings:
   - Framework preset: `None`
   - Build command: leave empty
   - Build output directory: `/`
7. Deploy.

## Bind a Custom Domain

1. Open the Cloudflare Pages project.
2. Go to `Custom domains`.
3. Click `Set up a custom domain`.
4. Enter your domain, for example `partner.yourdomain.com`.
5. Follow the DNS instructions from Cloudflare.
6. Add the same domain to Supabase `Site URL` and `Redirect URLs`.

## Google OAuth Setup

1. Open Google Cloud Console.
2. Create an OAuth client.
3. Add this authorized redirect URI:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

4. Copy the Google Client ID and Client Secret into the Supabase Google provider settings.

## Usage

### Admin

- Create partners
- Update contact email, status, payment date, and renewal date
- Review screenshots and approve or reject submissions

### Partner

- Sign in with the same email used in the admin-created contact record
- Get automatically linked to the partner profile
- Upload reading payment screenshots with month, amount, and notes
- Review personal submission history

## Git Quick Start

```powershell
git init
git add .
git commit -m "feat: bootstrap Partner Realm"
git branch -M main
git remote add origin https://github.com/<your-account>/partner-realm.git
git push -u origin main
```

## Suggested Next Steps

- Add more partner fields such as package type, contract ID, or channel source
- Move approval logic into a Supabase RPC or Edge Function if you want fully atomic updates
- Add client-side image preview and compression before upload
