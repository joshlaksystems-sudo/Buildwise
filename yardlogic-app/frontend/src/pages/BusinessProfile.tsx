import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import "./BusinessProfile.css";

interface BusinessData {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  stateName?: string;
  stateCode?: string;
  gstnType?: string;
  businessType?: string;
  industryVertical?: string;
  invoicePrefix?: string;
  invoiceStartNumber?: number;
  estimatePrefix?: string;
  estimateStartNumber?: number;
  challanPrefix?: string;
  challanStartNumber?: number;
  bankAccountNumber?: string;
  bankName?: string;
  ifscCode?: string;
  setupComplete: boolean;
}

interface SetupStatus {
  setupComplete: boolean;
  missingFields: string[];
  completionPercentage: number;
}

export const BusinessProfile: React.FC<{ businessId: string; onComplete?: () => void }> = ({
  businessId,
  onComplete,
}) => {
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);

  // State form
  const indianStates = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ];

  const stateCodeMap: Record<string, string> = {
    "Andhra Pradesh": "AP",
    "Arunachal Pradesh": "AR",
    Assam: "AS",
    Bihar: "BR",
    Chhattisgarh: "CT",
    Goa: "GA",
    Gujarat: "GJ",
    Haryana: "HR",
    "Himachal Pradesh": "HP",
    Jharkhand: "JH",
    Karnataka: "KA",
    Kerala: "KL",
    "Madhya Pradesh": "MP",
    Maharashtra: "MH",
    Manipur: "MN",
    Meghalaya: "ML",
    Mizoram: "MZ",
    Nagaland: "NL",
    Odisha: "OD",
    Punjab: "PB",
    Rajasthan: "RJ",
    Sikkim: "SK",
    "Tamil Nadu": "TN",
    Telangana: "TG",
    Tripura: "TR",
    "Uttar Pradesh": "UP",
    Uttarakhand: "UT",
    "West Bengal": "WB",
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await api(`/business/${businessId}`);
        setBusiness(response);

        const statusResponse = await api(`/business/${businessId}/setup-status`);
        setSetupStatus(statusResponse);
      } catch (err) {
        setError("Failed to load business profile");
      }
    };
    fetchData();
  }, [businessId]);

  const handleStateChange = (newState: string) => {
    if (business) {
      setBusiness({
        ...business,
        stateName: newState,
        stateCode: stateCodeMap[newState] || "",
      });
    }
  };

  const handleInputChange = (field: keyof BusinessData, value: any) => {
    if (business) {
      setBusiness({ ...business, [field]: value });
    }
  };

  const handleSave = async () => {
    if (!business) return;
    setSaving(true);
    setError("");

    try {
      const updated = await api(`/business/${businessId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: business.name,
          gstin: business.gstin,
          address: business.address,
          ownerName: business.ownerName,
          ownerPhone: business.ownerPhone,
          ownerEmail: business.ownerEmail,
          stateName: business.stateName,
          stateCode: business.stateCode,
          gstnType: business.gstnType,
          businessType: business.businessType,
          industryVertical: business.industryVertical,
          invoicePrefix: business.invoicePrefix,
          invoiceStartNumber: business.invoiceStartNumber,
          estimatePrefix: business.estimatePrefix,
          estimateStartNumber: business.estimateStartNumber,
          challanPrefix: business.challanPrefix,
          challanStartNumber: business.challanStartNumber,
          bankAccountNumber: business.bankAccountNumber,
          bankName: business.bankName,
          ifscCode: business.ifscCode,
        }),
      });

      setBusiness(updated);

      // Fetch updated setup status
      const statusResponse = await api(`/business/${businessId}/setup-status`);
      setSetupStatus(statusResponse);

      if (statusResponse.setupComplete && onComplete) {
        onComplete();
      }

      // Move to next step if not complete
      if (!statusResponse.setupComplete && step < 3) {
        setStep(step + 1);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (!business || !setupStatus) {
    return <div className="loading">Loading business profile...</div>;
  }

  return (
    <div className="business-profile">
      <div className="profile-header">
        <h2>Business Setup</h2>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${setupStatus.completionPercentage}%` }}
          />
        </div>
        <p className="completion-text">{setupStatus.completionPercentage}% Complete</p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="steps-container">
        {/* Step 1: Basic Business Info */}
        {step >= 1 && (
          <div className={`step ${step === 1 ? "active" : "completed"}`}>
            <h3>Step 1: Basic Information</h3>
            <div className="form-group">
              <label>Business Name *</label>
              <input
                type="text"
                value={business.name || ""}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter business name"
              />
            </div>

            <div className="form-group">
              <label>Owner Name *</label>
              <input
                type="text"
                value={business.ownerName || ""}
                onChange={(e) => handleInputChange("ownerName", e.target.value)}
                placeholder="Enter owner name"
              />
            </div>

            <div className="form-group">
              <label>Owner Email</label>
              <input
                type="email"
                value={business.ownerEmail || ""}
                onChange={(e) => handleInputChange("ownerEmail", e.target.value)}
                placeholder="Enter owner email"
              />
            </div>

            <div className="form-group">
              <label>Owner Phone</label>
              <input
                type="tel"
                value={business.ownerPhone || ""}
                onChange={(e) => handleInputChange("ownerPhone", e.target.value)}
                placeholder="Enter owner phone"
              />
            </div>

            <button onClick={handleSave} disabled={saving} className="btn-next">
              {saving ? "Saving..." : step < 3 ? "Next" : "Save"}
            </button>
          </div>
        )}

        {/* Step 2: Address & GST */}
        {step >= 2 && (
          <div className={`step ${step === 2 ? "active" : ""}`}>
            <h3>Step 2: Address & Tax</h3>
            <div className="form-group">
              <label>Address *</label>
              <textarea
                value={business.address || ""}
                onChange={(e) => handleInputChange("address", e.target.value)}
                placeholder="Enter full business address"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>State *</label>
              <select
                value={business.stateName || ""}
                onChange={(e) => handleStateChange(e.target.value)}
              >
                <option value="">Select State</option>
                {indianStates.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>GSTIN *</label>
              <input
                type="text"
                value={business.gstin || ""}
                onChange={(e) => handleInputChange("gstin", e.target.value)}
                placeholder="Enter GSTIN (15 digits)"
                maxLength={15}
              />
            </div>

            <div className="form-group">
              <label>GST Registration Type</label>
              <select
                value={business.gstnType || ""}
                onChange={(e) => handleInputChange("gstnType", e.target.value)}
              >
                <option value="">Select Type</option>
                <option value="Individual">Individual</option>
                <option value="Partnership">Partnership</option>
                <option value="Private Ltd">Private Limited</option>
                <option value="Public Ltd">Public Limited</option>
                <option value="Trust">Trust</option>
                <option value="LLP">LLP</option>
                <option value="OPC">OPC</option>
              </select>
            </div>

            <button onClick={handleSave} disabled={saving} className="btn-next">
              {saving ? "Saving..." : "Next"}
            </button>
          </div>
        )}

        {/* Step 3: Business Type & Billing Prefixes */}
        {step >= 3 && (
          <div className={`step ${step === 3 ? "active" : ""}`}>
            <h3>Step 3: Business Type & Billing</h3>
            <div className="form-group">
              <label>Business Type</label>
              <select
                value={business.businessType || ""}
                onChange={(e) => handleInputChange("businessType", e.target.value)}
              >
                <option value="">Select Type</option>
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Services">Services</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Distribution">Distribution</option>
              </select>
            </div>

            <div className="form-group">
              <label>Industry Vertical</label>
              <select
                value={business.industryVertical || ""}
                onChange={(e) => handleInputChange("industryVertical", e.target.value)}
              >
                <option value="">Select Industry</option>
                <option value="Cement">Cement</option>
                <option value="Steel">Steel</option>
                <option value="Medical">Medical</option>
                <option value="Grocery">Grocery</option>
                <option value="Hardware">Hardware</option>
                <option value="General">General</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Invoice Prefix</label>
                <input
                  type="text"
                  value={business.invoicePrefix || ""}
                  onChange={(e) => handleInputChange("invoicePrefix", e.target.value)}
                  placeholder="e.g., INV"
                />
              </div>
              <div className="form-group">
                <label>Start Number</label>
                <input
                  type="number"
                  value={business.invoiceStartNumber || 1}
                  onChange={(e) =>
                    handleInputChange("invoiceStartNumber", parseInt(e.target.value))
                  }
                  min={1}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Bank Account (Optional)</label>
                <input
                  type="text"
                  value={business.bankAccountNumber || ""}
                  onChange={(e) => handleInputChange("bankAccountNumber", e.target.value)}
                  placeholder="Account number"
                />
              </div>
              <div className="form-group">
                <label>Bank Name</label>
                <input
                  type="text"
                  value={business.bankName || ""}
                  onChange={(e) => handleInputChange("bankName", e.target.value)}
                  placeholder="Bank name"
                />
              </div>
            </div>

            <button onClick={handleSave} disabled={saving} className="btn-complete">
              {saving ? "Completing..." : "Complete Setup"}
            </button>
          </div>
        )}

        {setupStatus.setupComplete && (
          <div className="step completed-message">
            <h3>✓ Setup Complete!</h3>
            <p>Your business profile is now configured. You can start creating invoices and managing your business.</p>
          </div>
        )}
      </div>
    </div>
  );
};
