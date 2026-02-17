'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';

const ClientContext = createContext();

export const ClientProvider = ({ children }) => {
    const [supabase] = useState(() => createClient());
    const [user, setUser] = useState(null);
    const [clientDetails, setClientDetails] = useState(null);
    const [lastAction, setLastAction] = useState(Date.now());
    const router = useRouter();

    // 1. Monitor Auth State Changes (Handles refreshes automatically)
    useEffect(() => {
        // Initial session check
        supabase.auth.getSession().then(({ data: { session } }) => {
            console.log("Initial Session CHECK", session?.user)
            setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                console.log("Auth State Change JUST NOW")
                setLastAction(Date.now());
            }
        });

        return () => subscription.unsubscribe();
    }, [supabase]);

    // 2. Fetch Client Details when User is available
    useEffect(() => {
        const fetchClientDetails = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('client_details')
                    .select('*')
                    .eq('id', user.id)
                    .maybeSingle();

                if (data) {
                    setClientDetails(data);
                }
                if (error) {
                    console.error('Error fetching client details:', error);
                }
            } else {
                setClientDetails(null);
            }
        };

        fetchClientDetails();
    }, [user, supabase]);

    // 3. Background Service: Inactivity Checker
    useEffect(() => {
        const CHECK_INTERVAL = 3 * 60 * 60 * 1000;

        const interval = setInterval(() => {
            if (user && Date.now() - lastAction > CHECK_INTERVAL) {
                console.log("Inactivity limit reached. Logging out...");
                supabase.auth.signOut().then(() => {
                    router.push('/login');
                });
            }
        }, 3 * 60 * 1000); // Check every three minutes

        return () => clearInterval(interval);
    }, [lastAction, user, supabase, router]);

    // 4. Realtime Notification Listener (Future Feature)
    /*
    useEffect(() => {
        if (!user) return;

        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
                (payload) => {
                    console.log('New notification received!', payload);
                    // Trigger a toast or update local notification state here
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, supabase]);
    */

    // Helper to update activity from any page
    const trackAction = () => setLastAction(Date.now());

    return (
        <ClientContext.Provider value={{ user, clientDetails, trackAction }}>
            {children}
        </ClientContext.Provider>
    );
};

export const useClient = () => useContext(ClientContext);
