export const metadata = {
  title: {
    template: '%s | Overwatch',
    default: 'Overwatch',
  },
  description: "Threat Detection Dashboard",
};

export default async function AuthLayout({ children }) {
  return (
    <div className="min-h-full">
      {children}
    </div>
  );
}
