# AI-Powered CRM Backend

A comprehensive Node.js/Express backend for an AI-powered Customer Relationship Management system designed specifically for real estate professionals.

## Features

### Core Functionality
- **User Management**: Multi-role authentication (Admin, Manager, Agent)
- **Lead Management**: Comprehensive lead tracking and nurturing
- **Property Management**: Complete property listing and management system
- **Activity Tracking**: Detailed activity logging and scheduling
- **Dashboard Analytics**: Real-time statistics and performance metrics

### Technical Features
- **RESTful API**: Well-structured API endpoints for all operations
- **JWT Authentication**: Secure token-based authentication
- **Role-based Access Control**: Granular permissions system
- **MySQL Database**: Robust relational database design
- **Input Validation**: Comprehensive data validation
- **Error Handling**: Structured error responses
- **CORS Support**: Cross-origin resource sharing enabled

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **Environment Management**: dotenv
- **CORS**: cors middleware

## Installation & Setup

### Prerequisites

1. **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
2. **MySQL 8.0+**: Download from [mysql.com](https://www.mysql.com/)
3. **npm or yarn**: Package manager (npm comes with Node.js)

### Quick Start

1. **Clone and Navigate**
   ```bash
   cd crm-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Database
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=ai_crm_db
   DB_USER=your_username
   DB_PASSWORD=your_password
   
   # JWT
   JWT_SECRET=your-secret-key
   JWT_EXPIRATION=24h
   
   # Server
   PORT=3000
   NODE_ENV=development
   ```

4. **Database Setup**
   
   Create the database:
   ```sql
   CREATE DATABASE ai_crm_db;
   ```
   
   Import the schema:
   ```bash
   mysql -u your_username -p ai_crm_db < database/schema.sql
   ```
   
   (Optional) Import sample data:
   ```bash
   mysql -u your_username -p ai_crm_db < database/seed.sql
   ```

5. **Start the Server**
   ```bash
   npm start
   # or for development with auto-restart
   npm run dev
   ```

6. **Verify Installation**
   
   The server should start on `http://localhost:3000`
   
   Test the health endpoint:
   ```bash
   curl http://localhost:3000/api/health
   ```

## API Documentation

### Authentication Endpoints

#### POST /api/auth/signup
Register a new user
```json
{
  "username": "johndoe",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "555-0123",
  "role": "agent"
}
```

#### POST /api/auth/signin
User login
```json
{
  "username": "johndoe",
  "password": "password123"
}
```

### Lead Management

#### GET /api/leads
Retrieve all leads (with optional filters)
- Query parameters: `status`, `assigned_agent_id`, `search`, `limit`

#### POST /api/leads
Create a new lead
```json
{
  "first_name": "Jane",
  "last_name": "Smith",
  "email": "jane@example.com",
  "phone": "555-0124",
  "status": "new",
  "source": "website",
  "budget": 500000,
  "location_preference": "Downtown",
  "property_type": "apartment"
}
```

#### PUT /api/leads/:id
Update a lead

#### DELETE /api/leads/:id
Delete a lead

#### PATCH /api/leads/:id/status
Update lead status
```json
{
  "status": "qualified",
  "notes": "Lead is pre-approved for financing"
}
```

### Property Management

#### GET /api/properties
Retrieve all properties (with optional filters)
- Query parameters: `status`, `property_type`, `min_price`, `max_price`, `city`, `search`

#### POST /api/properties
Create a new property listing
```json
{
  "title": "Modern Downtown Apartment",
  "description": "Beautiful apartment with city views",
  "property_type": "apartment",
  "price": 485000,
  "bedrooms": 2,
  "bathrooms": 2.0,
  "square_feet": 1200,
  "address": "123 Main Street",
  "city": "Springfield",
  "state": "CA",
  "zip_code": "90210",
  "amenities": ["Pool", "Gym", "Parking"]
}
```

### Activity Management

#### GET /api/activities
Retrieve activities
- Query parameters: `type`, `status`, `user_id`, `lead_id`, `property_id`, `date_from`, `date_to`

#### POST /api/activities
Create a new activity
```json
{
  "type": "call",
  "description": "Follow-up call with client",
  "lead_id": 1,
  "scheduled_date": "2025-08-01T10:00:00Z",
  "notes": "Discuss financing options"
}
```

### Dashboard Analytics

#### GET /api/dashboard/stats
Retrieve comprehensive dashboard statistics

#### GET /api/dashboard/sales-performance
Get sales performance data for the last 12 months

#### GET /api/dashboard/lead-sources
Get lead source distribution and conversion rates

## Default User Accounts

After running the schema, these accounts are available:

### Administrator
- **Username**: `admin`
- **Password**: `admin123`
- **Email**: `admin@crm.com`
- **Role**: Admin

### Sample Agents (if seed data is loaded)
- **Username**: `john_agent`
- **Password**: `admin123`
- **Role**: Agent

**⚠️ IMPORTANT**: Change these passwords immediately in production!

## Database Schema

### Core Tables

1. **users** - User accounts and authentication
2. **leads** - Lead information and tracking
3. **properties** - Property listings
4. **activities** - Activity tracking and scheduling
5. **lead_property_interests** - Lead-property relationships
6. **notes** - Additional notes on entities
7. **communications** - Communication history
8. **documents** - File attachments
9. **system_settings** - Application configuration

### Key Relationships

- Users can be assigned multiple leads
- Leads can be interested in multiple properties
- Activities can be linked to leads and/or properties
- All entities support notes and document attachments

## Error Handling

The API uses standard HTTP status codes:

- **200**: Success
- **201**: Created
- **400**: Bad Request (validation errors)
- **401**: Unauthorized
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **500**: Internal Server Error

Error responses follow this format:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Development

### Available Scripts

```bash
# Start production server
npm start

# Start development server with auto-restart
npm run dev

# Run tests (if test suite is added)
npm test

# Check for security vulnerabilities
npm audit
```

### Project Structure

```
crm-backend/
├── config/           # Configuration files
│   ├── auth.config.js
│   └── db.config.js
├── controllers/      # Request handlers
│   ├── auth.controller.js
│   ├── lead.controller.js
│   ├── property.controller.js
│   ├── activity.controller.js
│   ├── user.controller.js
│   └── dashboard.controller.js
├── middleware/       # Custom middleware
│   ├── authJwt.js
│   └── index.js
├── models/          # Data models
│   ├── User.js
│   ├── Lead.js
│   ├── Property.js
│   └── Activity.js
├── routes/          # API routes
│   ├── auth.routes.js
│   ├── lead.routes.js
│   ├── property.routes.js
│   ├── activity.routes.js
│   ├── user.routes.js
│   └── dashboard.routes.js
├── database/        # Database files
│   ├── schema.sql
│   └── seed.sql
├── server.js        # Main server file
├── package.json
└── README.md
```

## Security Considerations

1. **Environment Variables**: Keep sensitive data in `.env` file
2. **JWT Secret**: Use a strong, unique secret key
3. **Password Hashing**: Passwords are hashed using bcrypt
4. **Input Validation**: All inputs are validated
5. **CORS**: Configure CORS for your frontend domain
6. **Rate Limiting**: Consider implementing rate limiting for production

## Production Deployment

### Environment Setup

1. Set `NODE_ENV=production`
2. Use a strong JWT secret
3. Configure proper database credentials
4. Set up SSL/TLS certificates
5. Configure proper CORS origins
6. Implement rate limiting
7. Set up logging and monitoring

### Recommended Infrastructure

- **Web Server**: Nginx (reverse proxy)
- **Process Manager**: PM2
- **Database**: MySQL 8.0+ with proper indexing
- **SSL**: Let's Encrypt or commercial certificate
- **Monitoring**: Application and database monitoring

## Support & Contribution

This is a complete backend implementation ready for production use. The codebase follows industry best practices and is well-documented for easy maintenance and extension.

### Key Features for Extension

- Modular architecture for easy feature addition
- Comprehensive error handling
- Flexible filtering and search capabilities
- Role-based access control
- Extensible activity tracking system
- Built-in analytics and reporting

## License

This project is available for use in accordance with the terms specified by the project creator.
