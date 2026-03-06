import { useClient } from "@/context/ClientContext";

const PageHeader = ({ Icon, title, description }) => {
    const { clientDetails } = useClient();
    return (
        <header className="bg-white border-b border-slate-200 py-5 px-8 shrink-0 flex justify-between items-center z-10">
            <div>
                <div className="flex items-center gap-2">
                    {Icon &&
                        <Icon className="w-6 h-6 stroke-3 text-slate-900" />
                    }
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
                </div>
                {
                    description &&
                    <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                }
            </div>

            <div>
                clientDetails = {clientDetails}
            </div>
        </header>
    );
};

export default PageHeader;