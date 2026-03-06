'use client';

import { createContext, useContext, useEffect, useState } from 'react';
// import { createClient } from '@/utils/supabase/client';
// import { useRouter } from 'next/navigation';

const ClientContext = createContext();

export const ClientProvider = ({ children }) => {
    const [lastAction, setLastAction] = useState(Date.now());

    const [clientDetails, setClientDetails] = useState("YO ");
    // const [projectDetails, setProjectDetails] = useState(null);

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
        <ClientContext.Provider value={{ trackAction, clientDetails, setClientDetails }}>
            {children}
        </ClientContext.Provider>
    );
};

export const useClient = () => useContext(ClientContext);