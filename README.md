## Deployment Configuration

This project is configured to deploy automatically to Vercel only when changes are pushed or merged to the `main` branch.

The deployment configuration is specified in `vercel.json`:
- **Automatic deployments**: Enabled only for the `main` branch
- **Feature branches**: Will not trigger production deployments
- **Framework**: Vite
- **Build command**: `npm run build`
- **Output directory**: `dist`

This helps prevent unnecessary preview deployments and conserves resources for feature branches.
