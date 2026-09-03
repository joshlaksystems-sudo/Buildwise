import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Customer { id: string; name: string; loyaltyPoints: number }
interface Campaign { id: string; channel: string; message: string; segment: string; status: string; sentCount: number }
interface Prediction { name: string; currentStock: number; unit: string; daysRemaining: number; dailyConsumptionRate: number; message: string }

export function Growth() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [points, setPoints] = useState("10");
  const [campaign, setCampaign] = useState({ channel: "WHATSAPP", segment: "all", message: "" });
  const [message, setMessage] = useState("");

  async function refresh() {
    const [nextCustomers, nextCampaigns, forecast] = await Promise.all([api<Customer[]>("/contacts/customers"), api<Campaign[]>("/growth/campaigns"), api<{ predictions: Prediction[] }>("/forecast/stock-out")]);
    setCustomers(nextCustomers); setCampaigns(nextCampaigns); setPredictions(forecast.predictions);
  }
  useEffect(() => { void refresh().catch(() => {}); }, []);

  async function addPoints() {
    if (!selectedCustomer) return;
    await api(`/growth/loyalty/${selectedCustomer}`, { method: "POST", body: JSON.stringify({ points: Number(points), reason: "Manual loyalty adjustment" }) });
    setMessage("Loyalty points updated."); await refresh();
  }
  async function createCampaign() {
    await api("/growth/campaigns", { method: "POST", body: JSON.stringify(campaign) });
    setCampaign({ ...campaign, message: "" }); setMessage("Campaign draft saved."); await refresh();
  }
  async function markSent(id: string) {
    await api(`/growth/campaigns/${id}/mark-sent`, { method: "POST" }); setMessage("Campaign marked ready/sent. Configure WhatsApp or SMS provider for actual delivery."); await refresh();
  }
  async function sendEmail(id: string) {
    await api(`/growth/campaigns/${id}/send-email`, { method: "POST" }); setMessage("Email campaign sent through Gmail."); await refresh();
  }

  return <div><p className="eyebrow">Growth & intelligence</p><h1>Customer growth</h1>{message && <p role="status" style={{ color: "var(--gold)" }}>{message}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 20 }}>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20 }}><h2>Loyalty points</h2><select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)}><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.loyaltyPoints || 0} points</option>)}</select><input type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Points (+/-)" /><button className="gold" disabled={!selectedCustomer} onClick={() => void addPoints()}>Update points</button></section>
      <section style={{ background: "var(--paper-raised)", border: "1px solid var(--rule)", padding: 20 }}><h2>Campaign draft</h2><select value={campaign.channel} onChange={(e) => setCampaign({ ...campaign, channel: e.target.value })}><option>EMAIL</option><option>WHATSAPP</option><option>SMS</option></select><select value={campaign.segment} onChange={(e) => setCampaign({ ...campaign, segment: e.target.value })}><option value="all">All customers</option><option value="high_value">High value</option><option value="frequent">Frequent</option><option value="dormant">Dormant</option></select><textarea value={campaign.message} onChange={(e) => setCampaign({ ...campaign, message: e.target.value })} placeholder="Write a customer message" /><button className="gold" disabled={!campaign.message.trim()} onClick={() => void createCampaign()}>Save campaign</button></section>
    </div>
    <section style={{ marginTop: 16 }}><h2>Campaigns</h2><table><thead><tr><th>Channel</th><th>Segment</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>{campaigns.map((item) => <tr key={item.id}><td>{item.channel}</td><td>{item.segment}</td><td>{item.message}</td><td>{item.status}</td><td>{item.status === "DRAFT" && (item.channel === "EMAIL" ? <button className="secondary" onClick={() => void sendEmail(item.id)}>Send with Gmail</button> : <button className="secondary" onClick={() => void markSent(item.id)}>Mark sent</button>)}</td></tr>)}</tbody></table></section>
    <section style={{ marginTop: 16 }}><h2>Reorder recommendations</h2><table><thead><tr><th>Product</th><th>Stock</th><th>Daily use</th><th>Expected run-out</th></tr></thead><tbody>{predictions.map((item) => <tr key={item.name}><td>{item.name}</td><td>{item.currentStock} {item.unit}</td><td>{item.dailyConsumptionRate} {item.unit}/day</td><td>{item.daysRemaining} days</td></tr>)}</tbody></table>{predictions.length === 0 && <p>No urgent stock-out predictions.</p>}</section>
  </div>;
}