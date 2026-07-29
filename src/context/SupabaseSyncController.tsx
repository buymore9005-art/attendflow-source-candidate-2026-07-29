import { useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { REALTIME_TABLES, isRealtimeFailureStatus, isRealtimeManagedQuery, realtimeQueryMatches, type RealtimeTable } from '@/lib/realtime-sync';
import { getSupabase } from '@/lib/supabase';

const RECONCILE_INTERVAL_MS = 30_000;

export function SupabaseSyncController() {
  const { activeMembership, loading, user } = useAuth();
  const organizationId = activeMembership?.organization_id ?? '';
  const userId = user?.id ?? '';
  const isRestoring = useIsRestoring();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isRestoring || loading || !userId || !organizationId) return;

    const client = getSupabase();
    let disposed = false;
    const invalidateTable = (table: RealtimeTable) => queryClient.invalidateQueries({
      predicate: (query) => realtimeQueryMatches(query.queryKey, table, organizationId),
      refetchType: 'active'
    });
    const reconcile = () => queryClient.invalidateQueries({
      predicate: (query) => isRealtimeManagedQuery(query.queryKey, organizationId),
      refetchType: 'active'
    });

    const channel = client.channel(`app-sync:${organizationId}:${userId}`);
    for (const table of REALTIME_TABLES) {
      const handleChange = () => { void invalidateTable(table); };
      channel
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, handleChange)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, handleChange);
    }
    channel.subscribe((status, error) => {
      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        void reconcile();
      } else if (isRealtimeFailureStatus(status)) {
        console.warn('Supabase realtime connection degraded', { status, error });
      }
    });

    const reconcileWhenAvailable = () => {
      if (navigator.onLine && document.visibilityState === 'visible') void reconcile();
    };
    const intervalId = window.setInterval(reconcileWhenAvailable, RECONCILE_INTERVAL_MS);
    window.addEventListener('online', reconcileWhenAvailable);
    document.addEventListener('visibilitychange', reconcileWhenAvailable);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('online', reconcileWhenAvailable);
      document.removeEventListener('visibilitychange', reconcileWhenAvailable);
      void client.removeChannel(channel);
    };
  }, [isRestoring, loading, organizationId, queryClient, userId]);

  return null;
}
