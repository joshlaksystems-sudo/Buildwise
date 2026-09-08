BEGIN;

-- iBIM demo data for the existing business only.
-- Business: 2197c8f8-f0bf-48e4-bf65-8d01278a341d
-- Safe to rerun: demo rows are upserted by deterministic IDs/numbers.

DO $$
DECLARE
  demo_business_id text := '2197c8f8-f0bf-48e4-bf65-8d01278a341d';
  row_number integer;
  member_id text;
  proposal_id text;
  policy_id text;
  demo_user_id text;
  renewal_date timestamp;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Business"
    WHERE id = demo_business_id AND "applicationId" = 'IBIM'
  ) THEN
    RAISE EXCEPTION 'Business % is missing or is not classified as IBIM', demo_business_id;
  END IF;

  SELECT ub."userId" INTO demo_user_id
  FROM "UserBusiness" ub
  WHERE ub."businessId" = demo_business_id
  ORDER BY ub.role = 'OWNER' DESC
  LIMIT 1;

  FOR row_number IN 1..100 LOOP
    member_id := md5('ibim-demo-member-' || row_number::text);

    INSERT INTO "IbimMember" (
      id, "businessId", "externalRef", "legalName", "tradingName",
      email, phone, status, source, "createdAt", "updatedAt"
    ) VALUES (
      member_id,
      demo_business_id,
      'DEMO-' || lpad(row_number::text, 3, '0'),
      'Demo Member ' || lpad(row_number::text, 3, '0'),
      'Demo Trade ' || lpad(row_number::text, 3, '0'),
      'ibim-demo-' || lpad(row_number::text, 3, '0') || '@example.com',
      '+44770090' || lpad(row_number::text, 3, '0'),
      'ACTIVE',
      'IMPORT',
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      "businessId" = EXCLUDED."businessId",
      "externalRef" = EXCLUDED."externalRef",
      "legalName" = EXCLUDED."legalName",
      "tradingName" = EXCLUDED."tradingName",
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      status = EXCLUDED.status,
      source = EXCLUDED.source,
      "updatedAt" = now();

    renewal_date := CASE
      WHEN row_number = 1 THEN now() + interval '30 days'
      WHEN row_number = 2 THEN now() - interval '5 days'
      ELSE now() + ((row_number % 90) + 1) * interval '1 day'
    END;

    INSERT INTO "IbimPolicy" (
      id, "businessId", "memberId", "policyNumber", "insurerName",
      status, "renewalDate", premium, commission, "createdAt", "updatedAt"
    ) VALUES (
      md5('ibim-demo-policy-' || row_number::text),
      demo_business_id,
      member_id,
      'DEMO-POL-' || lpad(row_number::text, 3, '0'),
      CASE WHEN row_number % 2 = 0 THEN 'Northstar Underwriting' ELSE 'Demo Mutual Insurers' END,
      'ACTIVE',
      renewal_date,
      5000 + (row_number * 100),
      500 + (row_number * 10),
      now(),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      "businessId" = EXCLUDED."businessId",
      "memberId" = EXCLUDED."memberId",
      "policyNumber" = EXCLUDED."policyNumber",
      "insurerName" = EXCLUDED."insurerName",
      status = EXCLUDED.status,
      "renewalDate" = EXCLUDED."renewalDate",
      premium = EXCLUDED.premium,
      commission = EXCLUDED.commission,
      "updatedAt" = now();
  END LOOP;

  -- Seed visible workflow activity for the client demonstration.
  FOR row_number IN 1..10 LOOP
    member_id := md5('ibim-demo-member-' || row_number::text);
    proposal_id := md5('ibim-demo-proposal-' || row_number::text);
    policy_id := md5('ibim-demo-policy-' || row_number::text);

    INSERT INTO "IbimProposal" (
      id, "businessId", "memberId", type, status, "formVersion", data,
      "submittedAt", "createdAt", "updatedAt"
    ) VALUES (
      proposal_id, demo_business_id, member_id,
      CASE WHEN row_number % 3 = 0 THEN 'RENEWAL' ELSE 'NEW_BUSINESS' END,
      CASE WHEN row_number % 3 = 0 THEN 'QUOTED' ELSE 'SUBMITTED' END,
      '1',
      jsonb_build_object('businessDescription', 'Demo insurance proposal ' || row_number, 'tradeAssociation', 'Demo Trade Association', 'annualTurnover', 100000 + row_number * 5000, 'employeeCount', 10 + row_number, 'requestedCover', 'Employers liability and professional indemnity'),
      now(), now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      "businessId" = EXCLUDED."businessId", "memberId" = EXCLUDED."memberId",
      type = EXCLUDED.type, status = EXCLUDED.status, data = EXCLUDED.data,
      "updatedAt" = now();

    UPDATE "IbimPolicy" SET "proposalId" = proposal_id, "updatedAt" = now() WHERE id = policy_id;

    INSERT INTO "IbimWorkflowTask" (
      id, "businessId", "memberId", "proposalId", "policyId", type, status,
      "dueAt", note, "createdAt", "updatedAt"
    ) VALUES (
      md5('ibim-demo-task-' || row_number::text), demo_business_id, member_id,
      proposal_id, policy_id,
      CASE WHEN row_number % 2 = 0 THEN 'RENEWAL' ELSE 'NEW_BUSINESS' END,
      'OPEN', now() + row_number * interval '1 day',
      'Demo action: review submitted insurance information', now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      "businessId" = EXCLUDED."businessId", "memberId" = EXCLUDED."memberId",
      "proposalId" = EXCLUDED."proposalId", "policyId" = EXCLUDED."policyId",
      status = EXCLUDED.status, "dueAt" = EXCLUDED."dueAt", note = EXCLUDED.note,
      "updatedAt" = now();

    INSERT INTO "IbimWorkflowEvent" (
      id, "businessId", "memberId", "proposalId", "policyId", "taskId",
      "eventType", "toStatus", "actorUserId", detail, "createdAt"
    ) VALUES (
      md5('ibim-demo-event-' || row_number::text), demo_business_id, member_id,
      proposal_id, policy_id, md5('ibim-demo-task-' || row_number::text),
      'DEMO_PROPOSAL_SUBMITTED', 'SUBMITTED', demo_user_id,
      jsonb_build_object('source', 'Neon demo seed', 'row', row_number), now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  FOR row_number IN 1..20 LOOP
    policy_id := md5('ibim-demo-policy-' || row_number::text);
    INSERT INTO "IbimTransaction" (
      id, "businessId", "policyId", type, amount, "transactionDate", reference, "createdAt"
    ) VALUES (
      md5('ibim-demo-transaction-' || row_number::text), demo_business_id, policy_id,
      CASE WHEN row_number % 5 = 0 THEN 'REBATE' WHEN row_number % 3 = 0 THEN 'PAYMENT' ELSE 'PREMIUM' END,
      1000 + row_number * 125, now() - row_number * interval '1 day',
      'DEMO-TXN-' || lpad(row_number::text, 3, '0'), now()
    )
    ON CONFLICT (id) DO UPDATE SET
      type = EXCLUDED.type, amount = EXCLUDED.amount,
      "transactionDate" = EXCLUDED."transactionDate", reference = EXCLUDED.reference;
  END LOOP;

  FOR row_number IN 1..10 LOOP
    INSERT INTO "AuditLog" (
      id, "businessId", "userId", action, "entityType", "entityId", detail, "createdAt"
    ) VALUES (
      md5('ibim-demo-audit-' || row_number::text), demo_business_id, demo_user_id,
      CASE WHEN row_number % 2 = 0 THEN 'ibim.proposal.submit' ELSE 'ibim.member.import' END,
      CASE WHEN row_number % 2 = 0 THEN 'IbimProposal' ELSE 'IbimMember' END,
      CASE WHEN row_number % 2 = 0 THEN md5('ibim-demo-proposal-' || row_number::text) ELSE md5('ibim-demo-member-' || row_number::text) END,
      jsonb_build_object('source', 'Neon demo seed', 'row', row_number), now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

COMMIT;

-- Verification: should return 100 members and 100 policies.
SELECT
  (SELECT count(*) FROM "IbimMember" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND "externalRef" LIKE 'DEMO-%') AS demo_members,
  (SELECT count(*) FROM "IbimPolicy" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND "policyNumber" LIKE 'DEMO-POL-%') AS demo_policies,
  (SELECT count(*) FROM "IbimProposal" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND id IN (SELECT md5('ibim-demo-proposal-' || n::text) FROM generate_series(1, 10) n)) AS demo_proposals,
  (SELECT count(*) FROM "IbimWorkflowTask" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND note LIKE 'Demo action:%') AS demo_tasks,
  (SELECT count(*) FROM "IbimTransaction" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND reference LIKE 'DEMO-TXN-%') AS demo_transactions,
  (SELECT count(*) FROM "AuditLog" WHERE "businessId" = '2197c8f8-f0bf-48e4-bf65-8d01278a341d' AND detail->>'source' = 'Neon demo seed') AS demo_audit;
