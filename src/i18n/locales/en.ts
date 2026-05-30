export const en = {
  nav: {
    groupMonitoring: 'Group Monitoring',
    admin: 'Admin',
    settings: 'Settings',
  },
  pages: {
    groupMonitoring: 'Group Monitoring',
    admin: 'Admin',
    settings: 'Settings',
  },
  subheader: {
    adminDesc: 'System configuration & session management',
    settingsDesc: 'Application preferences',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Application preferences',
    language: 'Language',
    languageDesc: 'Choose the display language for captions across the dashboard.',
    zh: '中文',
    en: 'English',
  },
  header: {
    welcome: 'Welcome',
    logout: 'Logout',
    toggleSidebar: 'Toggle sidebar',
    flagAlt: 'Malaysia',
  },
  tabs: {
    account: 'Account',
    ticket: 'Ticket',
  },
  brand: {
    name: 'Backend Operation',
    tagline: 'Resource Management',
  },
  kpi: {
    account: {
      brands: 'Brands',
      accounts: 'Accounts',
      active: 'Online',
      aligned: 'Aligned',
      issue: 'Issue',
    },
    ticket: {
      total: 'Tickets',
      pending: 'Pending',
      processing: 'Processing',
      done: 'Done',
      closed: 'Closed',
    },
  },
  groupMonitoring: {
    noAccounts: 'No accounts linked',
    noAccountsDesc: 'Link your first account to start group monitoring.',
    addAccount: 'Add account',
    noTickets: 'No tickets',
    noTicketsDesc: 'Support tickets will appear here when available.',
    accountFilters: 'Account filters',
    ticketFilters: 'Ticket filters',
  },
  login: {
    tagline: 'Telegram & WhatsApp Operations',
    username: 'Username',
    password: 'Password',
    usernamePlaceholder: 'Enter username',
    passwordPlaceholder: 'Enter password',
    submit: 'Login',
    loading: 'Signing in…',
    invalidCredentials: 'Invalid username or password',
    supabaseNotConfigured: 'Database is not configured. Check your .env file.',
    loginFailed: 'Login failed. Please try again.',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
  },
  admin: {
    title: 'System status',
    subtitle: 'Configuration & database connection',
    supabase: 'Supabase',
    activeSessions: 'Active sessions',
    platform: 'Platform',
    sessionTables: 'Session tables',
    connected: 'Connected',
    notConfigured: 'Not configured',
    desktop: 'Desktop',
    web: 'Web',
  },
  common: {
    appError: 'Application error',
    reloadApp: 'Reload app',
  },
};

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

export type Messages = DeepStringRecord<typeof en>;
