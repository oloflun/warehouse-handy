# Warehouse Handy

A modern warehouse management system built with React, TypeScript, and Supabase.

## Features

- 📦 **Inventory Management** - Track products across multiple locations
- 📊 **Stock Monitoring** - Real-time inventory levels and movements
- 📝 **Delivery Notes** - Process and manage incoming deliveries
- 🛒 **Purchase Orders** - Create and track purchase orders
- 🔄 **Integration Support** - Sync with external systems (Sellus, FDT)
- 👥 **User Management** - Role-based access control with read-only mode
- 📱 **Mobile-Friendly** - Responsive design for mobile devices
- �� **Barcode Scanning** - Quick product lookup and processing

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI Components**: shadcn/ui + Radix UI + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Supabase Auth
- **State Management**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- Supabase account (for backend)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/oloflun/warehouse-handy.git
cd warehouse-handy
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_PROJECT_ID=your-project-id
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_URL=https://your-project.supabase.co
```

Get these values from your Supabase project dashboard → Settings → API.

### 4. Run Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:8080`

## Available Scripts

```bash
# Development
npm run dev          # Start development server

# Production
npm run build        # Build for production
npm run build:dev    # Build for development mode
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
```

## Project Structure

```
warehouse-handy/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   ├── integrations/    # Supabase integration
│   ├── lib/             # Utility functions
│   └── App.tsx          # Main app component
├── supabase/
│   ├── functions/       # Edge Functions
│   ├── migrations/      # Database migrations
│   └── config.toml      # Supabase configuration
├── docs/                # Documentation
└── scripts/             # Utility scripts
```

## Database

The application uses Supabase (PostgreSQL) with 29 migrations covering:

- Product catalog
- Inventory tracking
- Order management
- Delivery notes
- User roles and permissions
- Integration sync tables

See `docs/DATABASE_SCHEMA.md` for detailed schema documentation.

## Supabase Edge Functions

18 Edge Functions handle backend operations:

- User management (invite, delete, update)
- Delivery note analysis (AI-powered)
- Label scanning
- External system integration (Sellus, FDT)
- Stock synchronization
- Batch operations

See function-specific READMEs in `supabase/functions/` for details.

## Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
- **[BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md)** - Backup and disaster recovery procedures
- **[DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)** - Complete database schema documentation
- **[EMAIL_CONFIGURATION.md](docs/EMAIL_CONFIGURATION.md)** - Email/SMTP setup guide
- **[USER_MANAGEMENT_CHANGES.md](docs/USER_MANAGEMENT_CHANGES.md)** - User system documentation
- **[USER_MANAGEMENT_TEST_PLAN.md](docs/USER_MANAGEMENT_TEST_PLAN.md)** - Testing procedures
- **[IMPLEMENTATION_SUMMARY.md](docs/IMPLEMENTATION_SUMMARY.md)** - Recent changes summary

## Deployment

The application can be deployed to various platforms:

- **Vercel** (Recommended) - Zero-config deployment
- **Netlify** - Automatic deployments from Git
- **Cloudflare Pages** - Global CDN distribution
- **GitHub Pages** - Free static hosting
- **AWS Amplify** - Full-stack deployment

See `docs/DEPLOYMENT_GUIDE.md` for detailed deployment instructions for each platform.

### Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/oloflun/warehouse-handy)

Remember to add environment variables after deployment!

## Backup and Restore

Regular backups are crucial for production systems:

```bash
# Create a backup
./scripts/backup.sh

# This will create a compressed backup in ./backups/
```

See `docs/BACKUP_AND_RESTORE.md` for complete backup and restore procedures.

## User Roles

The system supports hierarchical user roles:

1. **Super Admin** - Full system access (hidden from user list)
2. **Admin** - User management and data operations
3. **User** - Standard access to features
4. **Limited User** - Read-only access (cannot modify data)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security

- Database security enforced via Row Level Security (RLS) policies
- User authentication handled by Supabase Auth
- Environment variables for sensitive configuration
- Regular security audits recommended

Report security vulnerabilities to: oloflundin@icloud.com

## License

This project is proprietary software. All rights reserved.

## Support

- **Issues**: [GitHub Issues](https://github.com/oloflun/warehouse-handy/issues)
- **Email**: oloflundin@icloud.com
- **Documentation**: See `/docs` directory

## Acknowledgments

- Built with [Supabase](https://supabase.com)
- UI components from [shadcn/ui](https://ui.shadcn.com)
- Icons from [Lucide](https://lucide.dev)

---

**Made with ❤️ for efficient warehouse management**
