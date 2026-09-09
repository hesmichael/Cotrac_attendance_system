# COTRAC Attendance System

React and Vite attendance application with Firebase authentication and Firestore.

## Requirements

- Node.js 20 or newer
- A Firebase web app with Authentication and Firestore enabled

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the Firebase web app values. The values are available in **Firebase console > Project settings > Your apps**.

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Create a production build:

   ```bash
   npm run lint
   npm run build
   ```

Do not commit `.env.local`. It is ignored by Git.

## GitHub

Create a repository, then push the project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```

The GitHub Actions workflow runs type-checking and a production build for pushes to `main` and pull requests.

## Netlify deployment

1. In Netlify, choose **Add new site > Import an existing project** and select the GitHub repository.
2. Use the build settings already supplied by `netlify.toml`: build command `npm run build`, publish directory `dist`.
3. Add every `VITE_FIREBASE_*` variable from `.env.example` under **Site configuration > Environment variables**.
4. Deploy the site. The included redirect keeps client-side routes working on refresh.

## Vercel deployment

1. In Vercel, choose **Add New > Project** and import the GitHub repository.
2. Keep the Vite defaults, or use build command `npm run build` and output directory `dist`.
3. Add every `VITE_FIREBASE_*` variable from `.env.example` under the project environment variables for Preview and Production.
4. Deploy. `vercel.json` provides the SPA fallback for client-side routes.

## Firebase deployment notes

The Firebase web configuration is supplied through Vite environment variables so the repository can be used with different Firebase projects. Firebase web API keys are client-side identifiers; access control must still be enforced with Firebase Authentication and Firestore rules. Review `firestore.rules` before using the application with production data.
