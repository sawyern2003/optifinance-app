import { supabase } from '@/config/supabase';

// Helper function to convert orderBy string to Supabase order format
function parseOrderBy(orderBy) {
  if (!orderBy) return { column: 'created_at', ascending: false };
  
  const isDescending = orderBy.startsWith('-');
  const column = isDescending ? orderBy.slice(1) : orderBy;
  
  // Map Base44 field names to database column names if needed
  // Base44 uses snake_case which matches our database schema
  const columnMap = {
    'date': 'date',
    'created_date': 'created_at',
    'updated_date': 'updated_at',
    'treatment_name': 'treatment_name',
    'name': 'name'
  };
  
  return {
    column: columnMap[column] || column,
    ascending: !isDescending
  };
}

// Entity class that mimics Base44 entity interface
class Entity {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async list(orderBy = '-created_at') {
    try {
      const { column, ascending } = parseOrderBy(orderBy);
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .order(column, { ascending });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error listing ${this.tableName}:`, error);
      throw error;
    }
  }

  async filter(filters = {}, orderBy = '-created_at') {
    try {
      const { column, ascending } = parseOrderBy(orderBy);
      let query = supabase.from(this.tableName).select('*');
      
      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
      
      const { data, error } = await query.order(column, { ascending });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error filtering ${this.tableName}:`, error);
      throw error;
    }
  }

  async create(data) {
    try {
      const { data: result, error } = await supabase
        .from(this.tableName)
        .insert([data])
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      console.error(`Error creating ${this.tableName}:`, error);
      throw error;
    }
  }

  async update(id, data) {
    try {
      const { data: result, error } = await supabase
        .from(this.tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return result;
    } catch (error) {
      console.error(`Error updating ${this.tableName}:`, error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error(`Error deleting ${this.tableName}:`, error);
      throw error;
    }
  }
}

// Auth class that mimics Base44 auth interface
class Auth {
  async me() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      if (!user) return null;
      
      // Get user metadata from profiles table
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error fetching profile:', profileError);
      }
      
      return {
        id: user.id,
        email: user.email,
        full_name: profile?.full_name || user.user_metadata?.full_name || '',
        clinic_name: profile?.clinic_name || '',
        bank_name: profile?.bank_name || '',
        account_number: profile?.account_number || '',
        sort_code: profile?.sort_code || '',
        ...user.user_metadata,
        ...profile
      };
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  async updateMe(data) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      if (!user) throw new Error('No user found');
      
      // Update profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          ...data,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })
        .select()
        .single();
      
      if (profileError) throw profileError;
      
      return {
        id: user.id,
        email: user.email,
        ...profile
      };
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async logout() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.href = '/auth';
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  }
}

// Integrations class for Base44-like integrations
class Integrations {
  constructor() {
    this.Core = {
      InvokeLLM: this.InvokeLLM.bind(this),
      SendEmail: this.SendEmail.bind(this),
      UploadFile: this.UploadFile.bind(this),
      GenerateImage: this.GenerateImage.bind(this),
      ExtractDataFromUploadedFile: this.ExtractDataFromUploadedFile.bind(this),
      CreateFileSignedUrl: this.CreateFileSignedUrl.bind(this),
      UploadPrivateFile: this.UploadPrivateFile.bind(this),
    };
  }

  async InvokeLLM({ prompt, add_context_from_internet = false }) {
    // For now, return a placeholder response
    // You can integrate with OpenAI, Anthropic, or other LLM providers
    console.warn('InvokeLLM called but not implemented. Please configure an LLM service.');
    
    // Placeholder response
    return `AI Response: This is a placeholder. To enable AI features, please configure an LLM integration (OpenAI, Anthropic, etc.) in the backend. Original prompt: ${prompt.substring(0, 100)}...`;
  }

  async SendEmail({ from_name, to, subject, body }) {
    // Placeholder - integrate with email service (Resend, SendGrid, etc.)
    console.warn('SendEmail called but not implemented. Please configure an email service.');
    console.log('Would send email:', { from_name, to, subject, body: body.substring(0, 100) });
    return { success: true, message: 'Email sent (placeholder)' };
  }

  async UploadFile({ file }) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `public/${fileName}`;

      const { data, error } = await supabase.storage
        .from('files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('files')
        .getPublicUrl(filePath);

      return { file_url: publicUrl };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  async UploadPrivateFile({ file }) {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `private/${fileName}`;

      const { data, error } = await supabase.storage
        .from('files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: signedUrl } = await supabase.storage
        .from('files')
        .createSignedUrl(filePath, 3600);

      return { file_url: signedUrl?.signedUrl || filePath };
    } catch (error) {
      console.error('Error uploading private file:', error);
      throw error;
    }
  }

  async CreateFileSignedUrl({ file_path }) {
    try {
      const { data, error } = await supabase.storage
        .from('files')
        .createSignedUrl(file_path, 3600);

      if (error) throw error;
      return { signed_url: data?.signedUrl };
    } catch (error) {
      console.error('Error creating signed URL:', error);
      throw error;
    }
  }

  async GenerateImage({ prompt }) {
    // Placeholder - integrate with image generation service
    console.warn('GenerateImage called but not implemented.');
    return { image_url: 'placeholder-image-url' };
  }

  async ExtractDataFromUploadedFile({ file_url }) {
    // Placeholder - integrate with document parsing service
    console.warn('ExtractDataFromUploadedFile called but not implemented.');
    return { extracted_data: {} };
  }
}

// Functions class for custom functions
class Functions {
  async invoke(functionName, payload) {
    // Placeholder for custom functions
    // You can implement these as Supabase Edge Functions or API routes
    console.warn(`Function ${functionName} called but not implemented.`, payload);
    
    if (functionName === 'sendInvoiceSMS') {
      // Placeholder for SMS sending
      console.log('Would send SMS:', payload);
      return { success: true, message: 'SMS sent (placeholder)' };
    }
    
    if (functionName === 'consultantChat') {
      // Placeholder for consultant chat
      // Expected format: { data: { message: string } }
      return { 
        data: { 
          message: 'Consultant response (placeholder). To enable AI consultant features, please configure an LLM integration.' 
        } 
      };
    }
    
    if (functionName === 'verifySubscription') {
      // Subscription verification is handled by route protection
      // This function is kept for backward compatibility
      return { verified: true };
    }
    
    if (functionName === 'createGoCardlessPayment') {
      // Placeholder for GoCardless payment
      console.log('Would create GoCardless payment:', payload);
      return { success: true, payment_id: 'placeholder-payment-id' };
    }
    
    throw new Error(`Function ${functionName} not implemented`);
  }
}

// Main backend client that mimics Base44 SDK interface
export const backend = {
  entities: {
    Patient: new Entity('patients'),
    Practitioner: new Entity('practitioners'),
    TreatmentCatalog: new Entity('treatment_catalog'),
    TreatmentEntry: new Entity('treatment_entries'),
    Expense: new Entity('expenses'),
    ExportHistory: new Entity('export_history'),
    Invoice: new Entity('invoices'),
    CompetitorPricing: new Entity('competitor_pricing'),
    TaxSettings: new Entity('tax_settings'),
    ChatHistory: new Entity('chat_history'),
  },
  auth: new Auth(),
  integrations: new Integrations(),
  functions: new Functions(),
};

// Export supabase client for direct use if needed
export { supabase };
