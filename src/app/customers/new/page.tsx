import { Topbar } from "@/components/Topbar";
import { NewCustomerForm } from "@/components/NewCustomerForm";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 640 }}>
        <h1>New customer</h1>
        <div className="card">
          <NewCustomerForm />
        </div>
      </div>
    </>
  );
}
