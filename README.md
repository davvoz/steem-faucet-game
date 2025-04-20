# Steem Faucet Game

[![Process Steem Claims](https://github.com/davvoz/steem-faucet-game/actions/workflows/process-steem-claims.yml/badge.svg)](https://github.com/davvoz/steem-faucet-game/actions/workflows/process-steem-claims.yml)
[![Deploy to GitHub Pages](https://github.com/davvoz/steem-faucet-game/actions/workflows/deploy-github-pages.yml/badge.svg)](https://github.com/davvoz/steem-faucet-game/actions/workflows/github-pages-deploy.yml)

A modern web application that allows users to claim free STEEM tokens on a daily basis, built with Angular and Firebase.

## Features

- **Daily Token Claims**: Users can claim free STEEM tokens once per day
- **Tiered Reward System**: Increased rewards for consistent daily participation
- **User Authentication**: Secure login system powered by Firebase
- **Real-time Updates**: Immediate feedback on claim status
- **Responsive Design**: Works seamlessly on mobile and desktop devices
- **Dark/Light Theme**: User-selectable interface theme
- **Claim History**: Track your past claims and rewards
- **Community Stats**: View total tokens distributed and user participation

## Tech Stack

- **Frontend**: Angular 19+
- **Backend**: Firebase (Firestore, Authentication)
- **Blockchain Integration**: Steem API via dsteem
- **Automation**: GitHub Actions for processing claims
- **Styling**: SCSS with responsive design

## Prerequisites

- Node.js (v18+)
- npm (v9+)
- Angular CLI (v19+)
- Firebase CLI (for deployment)

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/steem-faucet-game.git
   cd steem-faucet-game
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   - Copy the template files to create your environment files:
     ```bash
     cp src/environments/environment.template.ts src/environments/environment.ts
     cp src/environments/environment.prod.template.ts src/environments/environment.prod.ts
     ```
   - Update the environment files with your Firebase credentials
   - Update Steem API endpoints if needed
   - **Note**: These environment files are ignored by git to prevent exposing sensitive information

4. Initialize the database (only required once)
   ```bash
   node init-database.js
   ```

## Development Server

Start the development server:

```bash
ng serve
```

Navigate to `http://localhost:4200/` in your browser. The application will automatically reload when you make changes to the source files.

## Building for Production

```bash
ng build --configuration production
```

The build artifacts will be stored in the `dist/` directory.

## Deployment

### Firebase Hosting

This project is set up for Firebase Hosting deployment:

```bash
npm run build
firebase deploy
```

### GitHub Pages

The project is also configured to deploy to GitHub Pages automatically:

1. The deployment is triggered on every push to the main branch
2. You can monitor the deployment status with the badge at the top of this README
3. The live site is available at: https://davvoz.github.io/steem-faucet-game/

For manual deployment to GitHub Pages:

```bash
ng deploy --base-href=/steem-faucet-game/
```

## Environment Variables Security

This project uses template files for environment configurations to avoid exposing sensitive API keys and credentials on GitHub:

1. Environment template files (`environment.template.ts` and `environment.prod.template.ts`) are committed to the repository with placeholder values
2. Actual environment files (`environment.ts` and `environment.prod.ts`) are excluded via `.gitignore`
3. Developers should create their own environment files locally based on the templates
4. For CI/CD pipelines, use GitHub Secrets or similar mechanisms to inject environment values

## Automated Claim Processing

The project includes a GitHub Actions workflow that processes pending Steem claims automatically. This ensures users receive their STEEM tokens even when they close their browser after submitting a claim.

## Project Structure

- `/src/app/core` - Core services for authentication, Steem interactions, and notifications
- `/src/app/features` - Main application features (faucet, admin panel)
- `/src/app/shared` - Shared components and services
- `/scripts` - Background processing scripts

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- The Steem blockchain community
- Firebase for providing the backend infrastructure
- Angular team for the excellent framework
