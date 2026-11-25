// Public Supabase Auth identifiers. This publishable key grants no database
// privileges by itself; never place a service-role key or database secret here.
export const SUPABASE_URL = 'https://ssopopwnuqygetznsmtg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-6i6b7pgsIAIZXcfiDJA7w_pEYz5-Xs";

export const ACCOUNT_CONFIG = Object.freeze({
  url: SUPABASE_URL,
  publishableKey: SUPABASE_PUBLISHABLE_KEY,
  passwordSignInEnabled: true,
  // Enable only after custom SMTP and exact redirect URLs have been configured
  // in Supabase. Existing accounts can sign in without sending email.
  emailSignInEnabled: false,
});
