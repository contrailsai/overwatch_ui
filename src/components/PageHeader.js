'use client';

import { useClient } from "@/context/ClientContext";
import NotificationsBell from "./NotificationsBell";

const PageHeader = ({ Icon, title, description }) => {
    const { clientDetails } = useClient();
    return (
        <header className="bg-white border-b border-slate-200 pt-[15px] pb-3 px-8 shrink-0 flex justify-between items-center z-10">
            <div className="flex items-center gap-3">
                {Icon &&
                    <Icon className="w-6 h-6 stroke-3 text-slate-900" />
                }
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            </div>

            <div className="flex items-center gap-4">
                <NotificationsBell />
            </div>
        </header>
    );
};

export default PageHeader;