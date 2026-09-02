import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./BankStatements.css";

interface BankStatementLine {
  date: string;
  description: string;
  amount: number;
  direction: "IN" | "OUT";
  reference?: string;
}

interface Match {
  statementLine: BankStatementLine;
  payment: any;
  matchType: "EXACT" | "PARTIAL";
  confidence: number;
}

interface UploadResult {
  summary: {
    totalLines: number;
    matched: number;
    unmatched: number;
    accountNumber: string;
    bankName: string;
    uploadedAt: string;
  };
  matches: Match[];
  unmatched: BankStatementLine[];
}

export const BankStatements: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [csvContent, setCsvContent] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<any>(null);
  const [reconciledPayments, setReconciledPayments] = useState<Set<string>>(new Set());

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setCsvContent(text);
  };

  const handleUpload = async () => {
    if (!csvContent || !accountNumber || !bankName) {
      alert("Please fill all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await api("/bank/statements/upload", {
        method: "POST",
        body: JSON.stringify({
          csvContent,
          accountNumber,
          bankName,
        }),
      });

      setResult(response);
      setCsvContent("");
      setAccountNumber("");
      setBankName("");
    } catch (error) {
      console.error("Error uploading statement:", error);
      alert("Failed to upload statement");
    } finally {
      setLoading(false);
    }
  };

  const handleReconcile = async (paymentId: string) => {
    try {
      await api(`/bank/statements/reconcile/${paymentId}`, { method: "PATCH", body: JSON.stringify({}) });
      setReconciledPayments(new Set([...reconciledPayments, paymentId]));
      alert("Payment reconciled");
    } catch (error) {
      console.error("Error reconciling payment:", error);
      alert("Failed to reconcile payment");
    }
  };

  const handleFetchDiscrepancies = async () => {
    try {
      const response = await api("/bank/statements/discrepancies");
      setDiscrepancies(response);
      setShowDiscrepancies(true);
    } catch (error) {
      console.error("Error fetching discrepancies:", error);
      alert("Failed to fetch discrepancies");
    }
  };

  return (
    <div className="bank-statements-page">
      <h2>Bank Reconciliation</h2>

      <div className="upload-section">
        <h3>Upload Bank Statement</h3>
        <p className="hint">CSV format: Date, Description, Amount, Direction (IN/OUT), Reference</p>

        <div className="form-group">
          <label>CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={loading}
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Account Number *</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="XXXX-XXXX-1234"
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label>Bank Name *</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="HDFC, ICICI, etc."
              disabled={loading}
            />
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={handleUpload}
          disabled={loading || !csvContent}
        >
          {loading ? "Uploading..." : "Upload & Match"}
        </button>
      </div>

      {result && (
        <>
          <div className="result-summary">
            <h3>Upload Summary</h3>
            <div className="summary-cards">
              <div className="card total">
                <div className="card-label">Total Lines</div>
                <div className="card-value">{result.summary.totalLines}</div>
              </div>
              <div className="card matched">
                <div className="card-label">Matched</div>
                <div className="card-value">{result.summary.matched}</div>
              </div>
              <div className="card unmatched">
                <div className="card-label">Unmatched</div>
                <div className="card-value">{result.summary.unmatched}</div>
              </div>
              <div className="card">
                <div className="card-label">Match Rate</div>
                <div className="card-value">
                  {((result.summary.matched / result.summary.totalLines) * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <p className="bank-info">
              <strong>Account:</strong> {result.summary.accountNumber} • <strong>Bank:</strong>{" "}
              {result.summary.bankName} • <strong>Uploaded:</strong>{" "}
              {new Date(result.summary.uploadedAt).toLocaleString()}
            </p>
          </div>

          {result.matches.length > 0 && (
            <div className="matches-section">
              <h3>Matched Payments ({result.matches.length})</h3>
              <table className="matches-table">
                <thead>
                  <tr>
                    <th>Statement Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Invoice/Bill</th>
                    <th>Match Type</th>
                    <th>Confidence</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((match, idx) => (
                    <tr key={idx}>
                      <td>{new Date(match.statementLine.date).toLocaleDateString()}</td>
                      <td className="description">{match.statementLine.description}</td>
                      <td>₹{match.statementLine.amount.toFixed(2)}</td>
                      <td>
                        {match.payment.invoice?.number || match.payment.bill?.number || "—"}
                      </td>
                      <td>
                        <span
                          className={`badge ${match.matchType === "EXACT" ? "exact" : "partial"}`}
                        >
                          {match.matchType}
                        </span>
                      </td>
                      <td>{(match.confidence * 100).toFixed(0)}%</td>
                      <td>
                        {reconciledPayments.has(match.payment.id) ? (
                          <span className="reconciled">✓ Reconciled</span>
                        ) : (
                          <button
                            className="btn-reconcile"
                            onClick={() => handleReconcile(match.payment.id)}
                          >
                            Reconcile
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.unmatched.length > 0 && (
            <div className="unmatched-section">
              <h3>Unmatched Lines ({result.unmatched.length})</h3>
              <p className="hint">These transactions don't have a matching payment in the system</p>
              <table className="unmatched-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Direction</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {result.unmatched.map((line, idx) => (
                    <tr key={idx}>
                      <td>{new Date(line.date).toLocaleDateString()}</td>
                      <td>{line.description}</td>
                      <td>₹{line.amount.toFixed(2)}</td>
                      <td>
                        <span className={`direction ${line.direction.toLowerCase()}`}>
                          {line.direction}
                        </span>
                      </td>
                      <td>{line.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="discrepancies-section">
        <h3>Check Discrepancies</h3>
        <p>Find unreconciled, duplicate, or orphaned payments</p>
        <button className="btn-secondary" onClick={handleFetchDiscrepancies}>
          Analyze Discrepancies
        </button>
      </div>

      {showDiscrepancies && discrepancies && (
        <div className="discrepancies-result">
          <h3>Discrepancy Report</h3>
          <div className="summary-cards">
            <div className="card warning">
              <div className="card-label">Unreconciled</div>
              <div className="card-value">{discrepancies.summary.unreconciled}</div>
            </div>
            <div className="card error">
              <div className="card-label">Duplicates</div>
              <div className="card-value">{discrepancies.summary.duplicates}</div>
            </div>
            <div className="card alert">
              <div className="card-label">Orphaned</div>
              <div className="card-value">{discrepancies.summary.orphaned}</div>
            </div>
          </div>

          {discrepancies.duplicates.length > 0 && (
            <div className="discrepancy-detail">
              <h4>Duplicate Payments</h4>
              <table className="discrepancy-table">
                <thead>
                  <tr>
                    <th>Payment 1</th>
                    <th>Payment 2</th>
                    <th>Amount</th>
                    <th>Time Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.duplicates.map((dup: any, idx: number) => (
                    <tr key={idx}>
                      <td>{dup.payment1.id.slice(0, 8)}...</td>
                      <td>{dup.payment2.id.slice(0, 8)}...</td>
                      <td>₹{dup.payment1.amount.toFixed(2)}</td>
                      <td>{(dup.timeDiffMs / 1000).toFixed(0)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {discrepancies.orphaned.length > 0 && (
            <div className="discrepancy-detail">
              <h4>Orphaned Payments (No Invoice/Bill)</h4>
              <table className="discrepancy-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Direction</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.orphaned.map((orphan: any, idx: number) => (
                    <tr key={idx}>
                      <td>{new Date(orphan.createdAt).toLocaleDateString()}</td>
                      <td>₹{orphan.amount.toFixed(2)}</td>
                      <td>{orphan.direction}</td>
                      <td>{orphan.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
