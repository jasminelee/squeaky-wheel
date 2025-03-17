import { supabase } from "@/integrations/supabase/client";

export type MessageStatus = 'pending' | 'approved' | 'rejected';

export interface MessageData {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: number;
  created_at: string;
  message_id: string;
  content: string;
  status: MessageStatus;
  transaction_signature?: string;
  senderUsername?: string;
  senderDisplayName?: string;
  senderAvatarUrl?: string;
  recipientUsername?: string;
}

/**
 * Fetch messages for a user based on wallet address
 * @param walletAddress The user's wallet address
 * @param type 'received' or 'sent'
 * @returns Array of messages
 */
export const fetchMessages = async (
  walletAddress: string | null,
  type: 'received' | 'sent' | 'all' = 'all'
): Promise<MessageData[]> => {
  if (!walletAddress) {
    console.log('No wallet address provided to fetchMessages');
    return [];
  }

  try {
    console.log(`Fetching ${type} messages for wallet: ${walletAddress}`);
    
    // Get the profile with this wallet address
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (profileError) {
      console.error('Error fetching profile:', profileError);
      
      // Create a new profile for this wallet address if it doesn't exist
      console.log('Creating a new profile for wallet address:', walletAddress);
      
      const newProfileId = crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`;
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: newProfileId,
          wallet_address: walletAddress,
          username: `user_${walletAddress.substring(0, 8)}`
        })
        .select('*')
        .single();
      
      if (createError || !newProfile) {
        console.error('Failed to create profile:', createError);
        return [];
      }
      
      console.log('New profile created:', newProfile);
      
      // Return empty array since this is a new profile with no messages yet
      return [];
    }
    
    console.log(`Found profile for wallet ${walletAddress}:`, userProfile);
    
    // Get messages based on the type
    let messagesQuery;
    
    if (type === 'received') {
      messagesQuery = supabase
        .from('messages')
        .select('*')
        .eq('recipient_id', userProfile.id);
    } else if (type === 'sent') {
      messagesQuery = supabase
        .from('messages')
        .select('*')
        .eq('sender_id', userProfile.id);
    } else {
      // For 'all', get both sent and received
      messagesQuery = supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userProfile.id},recipient_id.eq.${userProfile.id}`);
    }
    
    const { data: messages, error: messagesError } = await messagesQuery;
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return [];
    }
    
    console.log(`Found ${messages?.length || 0} messages for ${type} type`);
    
    // Fetch all profiles needed for these messages
    const senderIds = [...new Set(messages.map(msg => msg.sender_id))].filter(Boolean) as string[];
    const recipientIds = [...new Set(messages.map(msg => msg.recipient_id))].filter(Boolean) as string[];
    const profileIds = [...new Set([...senderIds, ...recipientIds])];
    
    // Create a map of profiles for quick lookup
    const profilesMap: Record<string, any> = {};
    
    // Only fetch profiles if we have IDs to fetch
    if (profileIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', profileIds);
      
      if (profilesError) {
        console.error('Error fetching profiles for messages:', profilesError);
      }
      
      // Populate the profiles map
      if (profilesData) {
        profilesData.forEach(profile => {
          profilesMap[profile.id] = profile;
        });
      }
    }
    
    // Format the messages with sender and recipient info
    const formattedMessages: MessageData[] = messages.map(msg => {
      const sender = profilesMap[msg.sender_id] || {};
      const recipient = profilesMap[msg.recipient_id] || {};
      
      return {
        id: msg.id,
        sender_id: msg.sender_id,
        recipient_id: msg.recipient_id,
        amount: typeof msg.amount === 'string' ? parseFloat(msg.amount) : msg.amount,
        created_at: msg.created_at,
        message_id: msg.message_id,
        content: msg.content,
        status: msg.status as MessageStatus,
        transaction_signature: msg.transaction_signature,
        senderUsername: sender?.username || 'Unknown User',
        senderDisplayName: sender?.username || 'Unknown User',
        senderAvatarUrl: sender?.avatar_url || '',
        recipientUsername: recipient?.username || 'Unknown User',
      };
    });
    
    // Sort messages by created_at (newest first)
    formattedMessages.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    console.log('Formatted messages:', formattedMessages);
    return formattedMessages;
  } catch (error) {
    console.error('Error in fetchMessages:', error);
    return [];
  }
};

/**
 * Get message statistics for a user
 */
export const getMessageStats = async (walletAddress: string | null) => {
  if (!walletAddress) {
    return {
      pendingReceived: 0,
      approvedReceived: 0,
      totalReceived: 0,
      pendingSent: 0,
      approvedSent: 0,
      totalSent: 0,
      totalEarnings: 0
    };
  }

  try {
    console.log(`Getting message stats for wallet: ${walletAddress}`);
    
    // Find the profile ID associated with this wallet address
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('wallet_address', walletAddress)
      .single();

    if (profileError || !profileData) {
      console.error('Error fetching profile:', profileError);
      return {
        pendingReceived: 0,
        approvedReceived: 0,
        totalReceived: 0,
        pendingSent: 0,
        approvedSent: 0,
        totalSent: 0,
        totalEarnings: 0
      };
    }

    const userId = profileData.id;
    console.log(`Found profile ID: ${userId} for wallet stats`);

    // Fetch received messages
    const { data: receivedMessages, error: receivedError } = await supabase
      .from('messages')
      .select('status, amount')
      .eq('recipient_id', userId);

    if (receivedError) {
      console.error('Error fetching received messages:', receivedError);
      return {
        pendingReceived: 0,
        approvedReceived: 0,
        totalReceived: 0,
        pendingSent: 0,
        approvedSent: 0,
        totalSent: 0,
        totalEarnings: 0
      };
    }

    // Fetch sent messages
    const { data: sentMessages, error: sentError } = await supabase
      .from('messages')
      .select('status, amount')
      .eq('sender_id', userId);

    if (sentError) {
      console.error('Error fetching sent messages:', sentError);
      return {
        pendingReceived: 0,
        approvedReceived: 0,
        totalReceived: 0,
        pendingSent: 0,
        approvedSent: 0,
        totalSent: 0,
        totalEarnings: 0
      };
    }

    console.log(`Found ${receivedMessages.length} received and ${sentMessages.length} sent messages for stats`);

    // Calculate stats
    const pendingReceived = receivedMessages.filter(msg => msg.status === 'pending').length;
    const approvedReceived = receivedMessages.filter(msg => msg.status === 'approved').length;
    const totalReceived = receivedMessages.length;
    
    const pendingSent = sentMessages.filter(msg => msg.status === 'pending').length;
    const approvedSent = sentMessages.filter(msg => msg.status === 'approved').length;
    const totalSent = sentMessages.length;
    
    const totalEarnings = receivedMessages
      .filter(msg => msg.status === 'approved')
      .reduce((sum, msg) => sum + (parseFloat(msg.amount as any) || 0), 0);

    return {
      pendingReceived,
      approvedReceived,
      totalReceived,
      pendingSent,
      approvedSent,
      totalSent,
      totalEarnings
    };
  } catch (error) {
    console.error('Error calculating message stats:', error);
    return {
      pendingReceived: 0,
      approvedReceived: 0,
      totalReceived: 0,
      pendingSent: 0,
      approvedSent: 0,
      totalSent: 0,
      totalEarnings: 0
    };
  }
};

/**
 * Save a message to the database
 */
export const saveMessage = async (
  senderWalletAddress: string,
  recipientWalletAddress: string,
  messageId: string,
  content: string,
  amount: number,
  transactionSignature?: string
): Promise<boolean> => {
  try {
    console.log('Saving message to database:', {
      senderWalletAddress,
      recipientWalletAddress,
      messageId,
      content: content.substring(0, 20) + '...',
      amount,
      transactionSignature
    });

    // Validate and fix message ID format - should start with 'm' followed by alphanumeric characters
    let validMessageId = messageId;
    if (!messageId || !messageId.startsWith('m') || messageId.length < 4) {
      console.warn('Invalid message ID format:', messageId);
      console.warn('Generating a new message ID in the correct format');
      validMessageId = `m${Date.now().toString(36).slice(-3)}`;
      console.log('New message ID:', validMessageId);
    }

    // Get or create sender profile
    const { data: senderProfile, error: senderError } = await supabase
      .from('profiles')
      .select('id')
      .eq('wallet_address', senderWalletAddress)
      .single();
    
    let senderId: string;
    
    if (senderError) {
      console.log('Sender profile not found, creating a new one');
      
      // Generate a UUID for the new profile
      const senderProfileId = crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}-sender`;
      
      // Create a new profile for the sender
      const { data: newSenderProfile, error: newSenderError } = await supabase
        .from('profiles')
        .insert({
          id: senderProfileId,
          wallet_address: senderWalletAddress,
          username: `user_${senderWalletAddress.substring(0, 8)}`
        })
        .select('id')
        .single();
      
      if (newSenderError || !newSenderProfile) {
        console.error('Failed to create sender profile:', newSenderError);
        return false;
      }
      
      senderId = newSenderProfile.id;
    } else {
      senderId = senderProfile.id;
    }

    // Get or create recipient profile
    const { data: recipientProfile, error: recipientError } = await supabase
      .from('profiles')
      .select('id')
      .eq('wallet_address', recipientWalletAddress)
      .single();
    
    let recipientId: string;
    
    if (recipientError) {
      console.log('Recipient profile not found, creating a new one');
      
      // Generate a UUID for the new profile
      const recipientProfileId = crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}-recipient`;
      
      // Create a new profile for the recipient
      const { data: newRecipientProfile, error: newRecipientError } = await supabase
        .from('profiles')
        .insert({
          id: recipientProfileId,
          wallet_address: recipientWalletAddress,
          username: `user_${recipientWalletAddress.substring(0, 8)}`
        })
        .select('id')
        .single();
      
      if (newRecipientError || !newRecipientProfile) {
        console.error('Failed to create recipient profile:', newRecipientError);
        return false;
      }
      
      recipientId = newRecipientProfile.id;
    } else {
      recipientId = recipientProfile.id;
    }

    console.log('Profiles found/created:', {
      senderId,
      recipientId
    });

    // Save the message
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          sender_id: senderId,
          recipient_id: recipientId,
          message_id: validMessageId,
          content,
          amount,
          status: 'pending' as MessageStatus,
          transaction_signature: transactionSignature
        }
      ]);

    if (error) {
      console.error('Error saving message:', error);
      return false;
    }

    console.log('Message saved successfully with ID:', validMessageId);
    return true;
  } catch (error) {
    console.error('Error in saveMessage:', error);
    return false;
  }
};

/**
 * Update message status
 */
export const updateMessageStatus = async (
  messageId: string,
  status: MessageStatus,
  transactionSignature?: string
): Promise<boolean> => {
  try {
    console.log(`Updating message status for message ID: ${messageId}`);
    console.log(`New status: ${status}`);
    console.log(`Transaction signature: ${transactionSignature || 'none'}`);
    
    // Validate message ID format
    if (!messageId.startsWith('m') || messageId.length < 4) {
      console.error('Invalid message ID format:', messageId);
      console.error('Message ID should start with "m" followed by at least 3 characters');
      return false;
    }
    
    // First check if the message exists
    const { data: existingMessage, error: checkError } = await supabase
      .from('messages')
      .select('id, status, message_id')
      .eq('message_id', messageId)
      .single();
    
    if (checkError) {
      console.error('Error checking for existing message:', checkError);
      
      // Try to find the message by database ID instead (in case messageId is actually a database ID)
      if (messageId.includes('-')) {
        console.log('Trying to find message by database ID instead...');
        
        const { data: messageById, error: idError } = await supabase
          .from('messages')
          .select('id, message_id')
          .eq('id', messageId)
          .single();
        
        if (idError || !messageById) {
          console.error('Message not found with ID:', messageId);
          return false;
        }
        
        console.log('Found message by database ID:', messageById);
        console.log('Using message_id for update:', messageById.message_id);
        
        // Update using the correct message_id
        const { error: updateError } = await supabase
          .from('messages')
          .update({ 
            status, 
            ...(transactionSignature ? { transaction_signature: transactionSignature } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', messageById.id);
        
        if (updateError) {
          console.error('Error updating message status:', updateError);
          return false;
        }
        
        console.log(`Successfully updated status for message with database ID: ${messageById.id}`);
        return true;
      }
      
      return false;
    }
    
    console.log('Found message to update:', existingMessage);
    
    // Update the message status in the database
    const { error } = await supabase
      .from('messages')
      .update({ 
        status, 
        ...(transactionSignature ? { transaction_signature: transactionSignature } : {}),
        updated_at: new Date().toISOString()
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('Error updating message status:', error);
      return false;
    }
    
    console.log(`Successfully updated status for message ID: ${messageId}`);
    return true;
  } catch (error) {
    console.error('Error in updateMessageStatus:', error);
    return false;
  }
};

/**
 * Fix database issues by ensuring all profiles have the correct wallet addresses
 * This can be called from the console to fix existing data
 */
export const fixDatabaseIssues = async () => {
  try {
    console.log('Starting database fix...');
    
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return false;
    }
    
    console.log(`Found ${profiles?.length || 0} profiles`);
    
    // Get all messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return false;
    }
    
    console.log(`Found ${messages?.length || 0} messages`);
    
    // Check for messages with missing sender or recipient profiles
    const senderIds = [...new Set(messages.map(msg => msg.sender_id))];
    const recipientIds = [...new Set(messages.map(msg => msg.recipient_id))];
    const allProfileIds = [...new Set([...senderIds, ...recipientIds])];
    
    const existingProfileIds = profiles.map(p => p.id);
    
    const missingProfileIds = allProfileIds.filter(id => !existingProfileIds.includes(id));
    
    if (missingProfileIds.length > 0) {
      console.log(`Found ${missingProfileIds.length} missing profile IDs referenced in messages`);
      console.log('Missing profile IDs:', missingProfileIds);
    } else {
      console.log('No missing profile IDs found');
    }
    
    console.log('Database fix completed');
    return true;
  } catch (error) {
    console.error('Error fixing database:', error);
    return false;
  }
};

/**
 * Directly check the database for messages by wallet address
 * This bypasses the profile lookup and can be used for debugging
 */
export const checkMessagesDirectly = async (walletAddress: string) => {
  try {
    console.log(`Directly checking messages for wallet: ${walletAddress}`);
    
    // First get all profiles to find the one with this wallet address
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return { error: 'Failed to fetch profiles' };
    }
    
    // Find the profile with this wallet address
    const profile = profiles.find(p => p.wallet_address === walletAddress);
    
    if (!profile) {
      console.log(`No profile found for wallet address: ${walletAddress}`);
      return { error: 'No profile found for this wallet address' };
    }
    
    console.log(`Found profile:`, profile);
    
    // Get all messages
    const { data: allMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return { error: 'Failed to fetch messages' };
    }
    
    // Filter messages for this profile
    const sentMessages = allMessages.filter(msg => msg.sender_id === profile.id);
    const receivedMessages = allMessages.filter(msg => msg.recipient_id === profile.id);
    
    console.log(`Found ${sentMessages.length} sent and ${receivedMessages.length} received messages`);
    
    return {
      profile,
      sentMessages,
      receivedMessages
    };
  } catch (error) {
    console.error('Error checking messages directly:', error);
    return { error: 'Failed to check messages' };
  }
};

/**
 * Console utility to help debug database issues
 * This can be called from the browser console
 */
export const debugDatabase = async () => {
  try {
    console.log('Starting database debug...');
    
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return { error: 'Failed to fetch profiles' };
    }
    
    console.log(`Found ${profiles?.length || 0} profiles:`);
    console.table(profiles);
    
    // Get all messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return { error: 'Failed to fetch messages' };
    }
    
    console.log(`Found ${messages?.length || 0} messages:`);
    console.table(messages);
    
    // Check for messages with missing sender or recipient profiles
    const senderIds = [...new Set(messages.map(msg => msg.sender_id))];
    const recipientIds = [...new Set(messages.map(msg => msg.recipient_id))];
    const allProfileIds = [...new Set([...senderIds, ...recipientIds])];
    
    const existingProfileIds = profiles.map(p => p.id);
    
    const missingProfileIds = allProfileIds.filter(id => !existingProfileIds.includes(id));
    
    if (missingProfileIds.length > 0) {
      console.log(`Found ${missingProfileIds.length} missing profile IDs referenced in messages:`);
      console.log(missingProfileIds);
      
      // Find messages with missing profiles
      const messagesWithMissingProfiles = messages.filter(
        msg => missingProfileIds.includes(msg.sender_id) || missingProfileIds.includes(msg.recipient_id)
      );
      
      console.log(`Found ${messagesWithMissingProfiles.length} messages with missing profiles:`);
      console.table(messagesWithMissingProfiles);
    } else {
      console.log('No missing profile IDs found');
    }
    
    // Check for profiles with missing wallet addresses
    const profilesWithoutWalletAddress = profiles.filter(p => !p.wallet_address);
    
    if (profilesWithoutWalletAddress.length > 0) {
      console.log(`Found ${profilesWithoutWalletAddress.length} profiles without wallet addresses:`);
      console.table(profilesWithoutWalletAddress);
    } else {
      console.log('No profiles without wallet addresses found');
    }
    
    console.log('Database debug completed');
    
    // Return the data for further inspection
    return {
      profiles,
      messages,
      missingProfileIds,
      profilesWithoutWalletAddress
    };
  } catch (error) {
    console.error('Error debugging database:', error);
    return { error: 'Failed to debug database' };
  }
};

/**
 * Fix message IDs in the database to use the correct format
 * This can be called from the console to fix existing data
 */
export const fixMessageIds = async (): Promise<boolean> => {
  try {
    console.log('Starting message ID fix...');
    
    // Get all messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return false;
    }
    
    console.log(`Found ${messages?.length || 0} messages`);
    
    // Filter messages with incorrect message_id format
    const incorrectMessages = messages.filter(msg => 
      !msg.message_id || 
      !msg.message_id.startsWith('m') || 
      msg.message_id.length < 4 ||
      msg.message_id.includes('-') // UUID format
    );
    
    console.log(`Found ${incorrectMessages.length} messages with incorrect message_id format`);
    
    if (incorrectMessages.length === 0) {
      console.log('No messages need fixing');
      return true;
    }
    
    // Process each incorrect message
    let successCount = 0;
    let failCount = 0;
    
    for (const msg of incorrectMessages) {
      try {
        // Generate a new message ID in the correct format
        const newMessageId = `m${Date.now().toString(36).slice(-3)}`;
        
        console.log(`Updating message ${msg.id}: changing message_id from "${msg.message_id}" to "${newMessageId}"`);
        
        // Update the message with the new ID
        const { error: updateError } = await supabase
          .from('messages')
          .update({ message_id: newMessageId })
          .eq('id', msg.id);
        
        if (updateError) {
          console.error(`Error updating message ${msg.id}:`, updateError);
          failCount++;
        } else {
          console.log(`Successfully updated message ${msg.id}`);
          successCount++;
        }
        
        // Add a small delay to ensure unique timestamps for message IDs
        await new Promise(resolve => setTimeout(resolve, 10));
      } catch (error) {
        console.error(`Error processing message ${msg.id}:`, error);
        failCount++;
      }
    }
    
    console.log(`Message ID fix completed: ${successCount} updated successfully, ${failCount} failed`);
    return true;
  } catch (error) {
    console.error('Error fixing message IDs:', error);
    return false;
  }
};

// Auto-fix message IDs when the module is loaded
if (typeof window !== 'undefined') {
  // Wait for the DOM to be ready
  window.addEventListener('DOMContentLoaded', () => {
    console.log('Auto-fixing message IDs...');
    fixMessageIds().then(result => {
      console.log('Auto-fix message IDs result:', result);
    });
  });
}

/**
 * Debug function to help diagnose message issues
 * This can be called from the browser console to check for common issues
 */
export const debugMessageApproval = async (messageId: string) => {
  try {
    console.log('Debugging message approval for message ID:', messageId);
    
    // Check if the message ID is in the correct format
    const isValidFormat = messageId.startsWith('m') && messageId.length >= 4;
    console.log('Is message ID in valid format:', isValidFormat);
    
    if (!isValidFormat) {
      console.error('Invalid message ID format. The message ID should start with "m" followed by at least 3 characters.');
    }
    
    // Check if the message exists in the database
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('message_id', messageId)
      .single();
    
    if (messageError) {
      console.error('Error finding message in database:', messageError);
      
      // If the message wasn't found by message_id, check if it's a database ID
      if (messageId.includes('-')) {
        console.log('Trying to find message by database ID instead...');
        
        const { data: messageById, error: idError } = await supabase
          .from('messages')
          .select('*')
          .eq('id', messageId)
          .single();
        
        if (idError) {
          console.error('Error finding message by database ID:', idError);
          return { error: 'Message not found in database' };
        }
        
        console.log('Found message by database ID:', messageById);
        console.log('Correct message_id to use for blockchain operations:', messageById.message_id);
        
        return {
          message: messageById,
          note: 'You provided a database ID, not a message_id. Use the message_id for blockchain operations.'
        };
      }
      
      return { error: 'Message not found in database' };
    }
    
    console.log('Found message in database:', message);
    
    // Get sender and recipient profiles
    const { data: senderProfile, error: senderError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', message.sender_id)
      .single();
    
    const { data: recipientProfile, error: recipientError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', message.recipient_id)
      .single();
    
    if (senderError) {
      console.error('Error finding sender profile:', senderError);
    } else {
      console.log('Sender profile:', senderProfile);
    }
    
    if (recipientError) {
      console.error('Error finding recipient profile:', recipientError);
    } else {
      console.log('Recipient profile:', recipientProfile);
    }
    
    // Check for duplicate messages with the same transaction signature
    if (message.transaction_signature) {
      const { data: duplicates, error: duplicatesError } = await supabase
        .from('messages')
        .select('id, message_id, status')
        .eq('transaction_signature', message.transaction_signature);
      
      if (duplicatesError) {
        console.error('Error checking for duplicates:', duplicatesError);
      } else if (duplicates && duplicates.length > 1) {
        console.warn(`Found ${duplicates.length} messages with the same transaction signature:`, duplicates);
      } else {
        console.log('No duplicate messages found with the same transaction signature');
      }
    }
    
    return {
      message,
      sender: senderProfile,
      recipient: recipientProfile,
      isValidFormat,
      instructions: 'Use the message_id (not the database id) when calling approveMessagePayment or rejectMessagePayment'
    };
  } catch (error) {
    console.error('Error debugging message approval:', error);
    return { error: 'Failed to debug message approval' };
  }
};

/**
 * Debug function to help diagnose message issues
 * This can be called from the browser console to check for common issues
 */
export const debugMessageIssues = async () => {
  try {
    console.log('Starting message issues debug...');
    
    // Get all messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching messages:', messagesError);
      return { error: 'Failed to fetch messages' };
    }
    
    console.log(`Found ${messages?.length || 0} total messages`);
    
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return { error: 'Failed to fetch profiles' };
    }
    
    console.log(`Found ${profiles?.length || 0} total profiles`);
    
    // Check for messages with missing sender or recipient profiles
    const senderIds = [...new Set(messages.map(msg => msg.sender_id))];
    const recipientIds = [...new Set(messages.map(msg => msg.recipient_id))];
    const allProfileIds = [...new Set([...senderIds, ...recipientIds])];
    
    const existingProfileIds = profiles.map(p => p.id);
    
    const missingProfileIds = allProfileIds.filter(id => !existingProfileIds.includes(id));
    
    if (missingProfileIds.length > 0) {
      console.error(`Found ${missingProfileIds.length} missing profile IDs referenced in messages`);
      console.error('Missing profile IDs:', missingProfileIds);
      
      // Find messages with missing profiles
      const messagesWithMissingProfiles = messages.filter(
        msg => missingProfileIds.includes(msg.sender_id) || missingProfileIds.includes(msg.recipient_id)
      );
      
      console.error(`Found ${messagesWithMissingProfiles.length} messages with missing profiles:`);
      console.table(messagesWithMissingProfiles);
    } else {
      console.log('All message sender and recipient profiles exist - good!');
    }
    
    // Check for profiles without wallet addresses
    const profilesWithoutWalletAddress = profiles.filter(p => !p.wallet_address);
    
    if (profilesWithoutWalletAddress.length > 0) {
      console.error(`Found ${profilesWithoutWalletAddress.length} profiles without wallet addresses:`);
      console.table(profilesWithoutWalletAddress);
    } else {
      console.log('All profiles have wallet addresses - good!');
    }
    
    // Check for duplicate wallet addresses in profiles
    const walletAddresses = profiles.map(p => p.wallet_address).filter(Boolean);
    const uniqueWalletAddresses = [...new Set(walletAddresses)];
    
    if (walletAddresses.length !== uniqueWalletAddresses.length) {
      console.error('Found duplicate wallet addresses in profiles!');
      
      // Find the duplicates
      const walletCounts: Record<string, number> = {};
      walletAddresses.forEach(addr => {
        if (addr) {
          walletCounts[addr] = (walletCounts[addr] || 0) + 1;
        }
      });
      
      const duplicateWallets = Object.entries(walletCounts)
        .filter(([_, count]) => count > 1)
        .map(([addr, count]) => ({ wallet_address: addr, count }));
      
      console.error('Duplicate wallet addresses:', duplicateWallets);
      
      // Find the profiles with duplicate wallet addresses
      for (const { wallet_address } of duplicateWallets) {
        const duplicateProfiles = profiles.filter(p => p.wallet_address === wallet_address);
        console.error(`Profiles with wallet address ${wallet_address}:`, duplicateProfiles);
      }
    } else {
      console.log('No duplicate wallet addresses found - good!');
    }
    
    // Check for messages with invalid message_id format
    const messagesWithInvalidId = messages.filter(
      msg => !msg.message_id || !msg.message_id.startsWith('m') || msg.message_id.length < 4
    );
    
    if (messagesWithInvalidId.length > 0) {
      console.error(`Found ${messagesWithInvalidId.length} messages with invalid message_id format:`);
      console.table(messagesWithInvalidId);
    } else {
      console.log('All messages have valid message_id format - good!');
    }
    
    // Check for messages with duplicate message_id
    const messageIds = messages.map(m => m.message_id);
    const uniqueMessageIds = [...new Set(messageIds)];
    
    if (messageIds.length !== uniqueMessageIds.length) {
      console.error('Found duplicate message_ids!');
      
      // Find the duplicates
      const messageCounts: Record<string, number> = {};
      messageIds.forEach(id => {
        messageCounts[id] = (messageCounts[id] || 0) + 1;
      });
      
      const duplicateMessageIds = Object.entries(messageCounts)
        .filter(([_, count]) => count > 1)
        .map(([id, count]) => ({ message_id: id, count }));
      
      console.error('Duplicate message_ids:', duplicateMessageIds);
      
      // Find the messages with duplicate message_ids
      for (const { message_id } of duplicateMessageIds) {
        const duplicateMessages = messages.filter(m => m.message_id === message_id);
        console.error(`Messages with message_id ${message_id}:`, duplicateMessages);
      }
    } else {
      console.log('No duplicate message_ids found - good!');
    }
    
    console.log('Message issues debug completed');
    
    return {
      totalMessages: messages.length,
      totalProfiles: profiles.length,
      missingProfileIds,
      profilesWithoutWalletAddress,
      messagesWithInvalidId,
      hasDuplicateMessageIds: messageIds.length !== uniqueMessageIds.length,
      hasDuplicateWalletAddresses: walletAddresses.length !== uniqueWalletAddresses.length
    };
  } catch (error) {
    console.error('Error debugging message issues:', error);
    return { error: 'Failed to debug message issues' };
  }
};

// Add this function to fix message retrieval issues
export const fixMessageRetrieval = async (walletAddress: string): Promise<boolean> => {
  try {
    console.log('Starting message retrieval fix for wallet:', walletAddress);
    
    // First, get the profile ID for this wallet address
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, wallet_address, username')
      .eq('wallet_address', walletAddress)
      .single();
    
    if (profileError || !profileData) {
      console.error('Error finding profile for wallet address:', profileError);
      return false;
    }
    
    console.log('Found profile:', profileData);
    
    // Get all messages in the database
    const { data: allMessages, error: messagesError } = await supabase
      .from('messages')
      .select('*');
    
    if (messagesError) {
      console.error('Error fetching all messages:', messagesError);
      return false;
    }
    
    console.log(`Found ${allMessages?.length || 0} total messages in database`);
    
    // Check for messages where this user is sender or recipient
    const userMessages = allMessages.filter(
      msg => msg.sender_id === profileData.id || msg.recipient_id === profileData.id
    );
    
    console.log(`Found ${userMessages.length} messages for this user`);
    console.log('User messages:', userMessages);
    
    // Check if any messages have incorrect message_id format
    const incorrectMessages = userMessages.filter(msg => 
      !msg.message_id || 
      !msg.message_id.startsWith('m') || 
      msg.message_id.length < 4
    );
    
    console.log(`Found ${incorrectMessages.length} messages with incorrect message_id format`);
    
    // Fix messages with incorrect format
    let fixedCount = 0;
    for (const msg of incorrectMessages) {
      // Generate a new message ID in the correct format
      const newMessageId = `m${Date.now().toString(36).slice(-3)}`;
      
      console.log(`Fixing message ${msg.id}: changing message_id from "${msg.message_id}" to "${newMessageId}"`);
      
      // Update the message with the new ID
      const { error: updateError } = await supabase
        .from('messages')
        .update({ message_id: newMessageId })
        .eq('id', msg.id);
      
      if (updateError) {
        console.error(`Error updating message ${msg.id}:`, updateError);
      } else {
        console.log(`Successfully updated message ${msg.id}`);
        fixedCount++;
      }
      
      // Add a small delay to ensure unique timestamps for message IDs
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Check for messages with missing sender or recipient profiles
    const senderIds = [...new Set(allMessages.map(msg => msg.sender_id))];
    const recipientIds = [...new Set(allMessages.map(msg => msg.recipient_id))];
    const allProfileIds = [...new Set([...senderIds, ...recipientIds])];
    
    // Get all profiles
    const { data: allProfiles, error: allProfilesError } = await supabase
      .from('profiles')
      .select('id, wallet_address, username');
    
    if (allProfilesError) {
      console.error('Error fetching all profiles:', allProfilesError);
      return false;
    }
    
    const existingProfileIds = allProfiles.map(p => p.id);
    
    const missingProfileIds = allProfileIds.filter(id => !existingProfileIds.includes(id));
    
    if (missingProfileIds.length > 0) {
      console.error(`Found ${missingProfileIds.length} missing profile IDs referenced in messages`);
      console.error('Missing profile IDs:', missingProfileIds);
      
      // Find messages with missing profiles
      const messagesWithMissingProfiles = allMessages.filter(
        msg => missingProfileIds.includes(msg.sender_id) || missingProfileIds.includes(msg.recipient_id)
      );
      
      console.error(`Found ${messagesWithMissingProfiles.length} messages with missing profiles`);
    } else {
      console.log('All message sender and recipient profiles exist - good!');
    }
    
    console.log(`Message retrieval fix completed: ${fixedCount} messages fixed`);
    return true;
  } catch (error) {
    console.error('Error fixing message retrieval:', error);
    return false;
  }
};

// Make only essential debug functions available globally
if (typeof window !== 'undefined') {
  (window as any).debugDatabase = async () => {
    try {
      console.log('Starting database debug...');
      
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return { error: 'Failed to fetch profiles' };
      }
      
      console.log(`Found ${profiles?.length || 0} profiles:`);
      console.table(profiles);
      
      // Get all messages
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*');
      
      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        return { error: 'Failed to fetch messages' };
      }
      
      console.log(`Found ${messages?.length || 0} messages:`);
      console.table(messages);
      
      return { profiles, messages };
    } catch (error) {
      console.error('Error debugging database:', error);
      return { error: 'Failed to debug database' };
    }
  };
  
  console.log('Database debug utilities added to window object. Use window.debugDatabase() to debug.');
}
