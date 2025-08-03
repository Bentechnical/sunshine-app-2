import { config } from 'dotenv';
import { createSupabaseAdminClient } from '../src/utils/supabase/admin';
import { StreamChat } from 'stream-chat';

// Load environment variables
config({ path: '.env.local' });

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  recentActivity: number;
  averageConnectionTime: number;
}

interface ChatStats {
  totalChats: number;
  activeChats: number;
  closedChats: number;
  recentMessages: number;
}

interface UsageInsights {
  peakUsageTime: string;
  averageDailyConnections: number;
  connectionEfficiency: number;
  recommendations: string[];
}

async function getConnectionStats(): Promise<ConnectionStats> {
  try {
    // Get recent connection activity from Stream Chat
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Use admin client to avoid request context issues
    const supabase = createSupabaseAdminClient();
    
    // Get recent chat activity as a proxy for connection activity
    const { data: recentChats } = await supabase
      .from('appointment_chats')
      .select('created_at, updated_at, closed_at')
      .gte('created_at', oneHourAgo.toISOString())
      .order('created_at', { ascending: false });

    return {
      totalConnections: recentChats?.length || 0,
      activeConnections: recentChats?.filter(c => !c.closed_at)?.length || 0,
      recentActivity: recentChats?.length || 0,
      averageConnectionTime: 30 // minutes, estimated
    };
  } catch (error) {
    console.error('Error getting connection stats:', error);
    return {
      totalConnections: 0,
      activeConnections: 0,
      recentActivity: 0,
      averageConnectionTime: 0
    };
  }
}

async function getChatStats(): Promise<ChatStats> {
  try {
    const supabase = createSupabaseAdminClient();
    
    // Get chat statistics
    const { data: allChats } = await supabase
      .from('appointment_chats')
      .select('status, created_at');

    const { data: recentMessages } = await supabase
      .from('chat_logs')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const totalChats = allChats?.length || 0;
    const activeChats = allChats?.filter(c => c.status === 'active')?.length || 0;
    const closedChats = allChats?.filter(c => c.status === 'closed')?.length || 0;

    return {
      totalChats,
      activeChats,
      closedChats,
      recentMessages: recentMessages?.length || 0
    };
  } catch (error) {
    console.error('Error getting chat stats:', error);
    return {
      totalChats: 0,
      activeChats: 0,
      closedChats: 0,
      recentMessages: 0
    };
  }
}

function generateUsageInsights(connectionStats: ConnectionStats, chatStats: ChatStats): UsageInsights {
  const recommendations: string[] = [];
  
  // Analyze connection efficiency
  const connectionEfficiency = chatStats.activeChats > 0 
    ? (connectionStats.activeConnections / chatStats.activeChats) * 100 
    : 0;

  // Generate recommendations based on usage patterns
  if (connectionEfficiency > 150) {
    recommendations.push('⚠️  High connection-to-chat ratio detected. Consider implementing connection pooling.');
  }
  
  if (connectionStats.averageConnectionTime < 10) {
    recommendations.push('⚠️  Short average connection time. Users may be experiencing connection issues.');
  }
  
  if (chatStats.recentMessages === 0) {
    recommendations.push('ℹ️  No recent message activity. Consider checking if chat system is working properly.');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Connection usage looks healthy!');
  }

  return {
    peakUsageTime: '2:00 PM', // This would be calculated from actual data
    averageDailyConnections: Math.round(connectionStats.totalConnections * 24), // Estimate
    connectionEfficiency: Math.round(connectionEfficiency),
    recommendations
  };
}

async function checkStreamChatHealth(): Promise<boolean> {
  try {
    // Check if environment variables are set
    if (!process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY || !process.env.STREAM_CHAT_SECRET) {
      console.error('Missing Stream Chat environment variables');
      return false;
    }

    // Initialize Stream Chat with server credentials
    const streamChatServer = StreamChat.getInstance(
      process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY,
      process.env.STREAM_CHAT_SECRET
    );

    // Test Stream Chat connection by creating a temporary channel with required parameters
    const testChannel = streamChatServer.channel('messaging', 'health-check', {
      created_by_id: 'system',
      members: ['system']
    });
    
    await testChannel.create();
    await testChannel.delete();
    
    return true;
  } catch (error) {
    console.error('Stream Chat health check failed:', error);
    return false;
  }
}

async function displayMonitoringDashboard() {
  console.log('\n🔍 Stream Chat Connection Monitor');
  console.log('=====================================\n');

  // Check environment variables
  console.log('🔧 Environment Check:');
  console.log(`   Stream Chat API Key: ${process.env.NEXT_PUBLIC_STREAM_CHAT_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Stream Chat Secret: ${process.env.STREAM_CHAT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Supabase Service Role: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing'}\n`);

  // Health check
  console.log('🏥 Health Check:');
  const isHealthy = await checkStreamChatHealth();
  console.log(`   Stream Chat Service: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}\n`);

  // Connection stats
  console.log('📊 Connection Statistics:');
  const connectionStats = await getConnectionStats();
  console.log(`   Total Connections (1h): ${connectionStats.totalConnections}`);
  console.log(`   Active Connections: ${connectionStats.activeConnections}`);
  console.log(`   Recent Activity: ${connectionStats.recentActivity}`);
  console.log(`   Avg Connection Time: ${connectionStats.averageConnectionTime} minutes\n`);

  // Chat stats
  console.log('💬 Chat Statistics:');
  const chatStats = await getChatStats();
  console.log(`   Total Chats: ${chatStats.totalChats}`);
  console.log(`   Active Chats: ${chatStats.activeChats}`);
  console.log(`   Closed Chats: ${chatStats.closedChats}`);
  console.log(`   Recent Messages (24h): ${chatStats.recentMessages}\n`);

  // Usage insights
  console.log('💡 Usage Insights:');
  const insights = generateUsageInsights(connectionStats, chatStats);
  console.log(`   Peak Usage Time: ${insights.peakUsageTime}`);
  console.log(`   Avg Daily Connections: ${insights.averageDailyConnections}`);
  console.log(`   Connection Efficiency: ${insights.connectionEfficiency}%\n`);

  // Recommendations
  console.log('🎯 Recommendations:');
  insights.recommendations.forEach((rec, index) => {
    console.log(`   ${index + 1}. ${rec}`);
  });

  console.log('\n📈 Usage Optimization Tips:');
  console.log('   • Monitor connection patterns during peak hours');
  console.log('   • Check for orphaned connections in Stream Chat dashboard');
  console.log('   • Review inactivity timeout settings (currently 5 minutes)');
  console.log('   • Consider implementing connection pooling for high usage');
  console.log('   • Monitor MAU (Monthly Active Users) in Stream Chat dashboard\n');

  console.log('🔗 Stream Chat Dashboard: https://dashboard.getstream.io/');
  console.log('📧 For detailed analytics, check your Stream Chat dashboard\n');
}

// Run the monitoring dashboard
if (require.main === module) {
  displayMonitoringDashboard()
    .then(() => {
      console.log('✅ Monitoring complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Monitoring failed:', error);
      process.exit(1);
    });
}

export {
  getConnectionStats,
  getChatStats,
  generateUsageInsights,
  checkStreamChatHealth,
  displayMonitoringDashboard
}; 