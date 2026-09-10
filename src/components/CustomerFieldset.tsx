export interface CustomerFormValues {
  id: number;
  name: string;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  mobile: string | null;
  email: string | null;
  alternateEmail: string | null;
  notes: string | null;
}

/** The customer field inputs shared between NewCustomerForm and
 * EditCustomerForm -- kept in its own small module (not a client
 * component itself) so it can be imported by both without pulling
 * EditCustomerForm's useActionState usage into NewCustomerForm's module,
 * see NewCustomerForm.tsx's comment for why that split matters here. */
export function CustomerFieldset({ customer }: { customer?: CustomerFormValues }) {
  return (
    <>
      <div className="field">
        <label htmlFor="name">Customer name</label>
        <input id="name" name="name" required autoFocus={!customer} defaultValue={customer?.name} />
      </div>
      <div className="field">
        <label htmlFor="address">Address</label>
        <input id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="suburb">Suburb</label>
          <input id="suburb" name="suburb" defaultValue={customer?.suburb ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="state">State</label>
          <input id="state" name="state" defaultValue={customer?.state ?? ""} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="postcode">Postcode</label>
          <input id="postcode" name="postcode" defaultValue={customer?.postcode ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="mobile">Mobile telephone</label>
          <input id="mobile" name="mobile" type="tel" defaultValue={customer?.mobile ?? ""} />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="alternateEmail">Alternate email address</label>
          <input
            id="alternateEmail"
            name="alternateEmail"
            type="email"
            defaultValue={customer?.alternateEmail ?? ""}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={4} defaultValue={customer?.notes ?? ""} />
      </div>
    </>
  );
}
