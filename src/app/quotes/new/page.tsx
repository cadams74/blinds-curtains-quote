import { Topbar } from "@/components/Topbar";
import { createQuote } from "@/lib/actions";

export default function NewQuotePage() {
  return (
    <>
      <Topbar />
      <div className="page" style={{ maxWidth: 480 }}>
        <h1>New quote</h1>
        <div className="card">
          <form action={createQuote}>
            <div className="field">
              <label htmlFor="customerName">Customer name</label>
              <input id="customerName" name="customerName" required autoFocus />
            </div>
            <button className="btn" type="submit">
              Create quote
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
