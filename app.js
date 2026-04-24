import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.PARTNER_REALM_CONFIG || {};
const app = document.getElementById("app");

if (
  !config.supabaseUrl ||
  config.supabaseUrl.includes("YOUR_PROJECT") ||
  !config.supabaseAnonKey ||
  config.supabaseAnonKey.includes("YOUR_SUPABASE")
) {
  app.innerHTML = `
    <section class="panel">
      <h2>Supabase setup is required</h2>
      <p class="subtle">Edit <code>config.js</code> with your Supabase URL, anon key, and production site URL, then refresh this page.</p>
      <div class="notice notice-info spaced">
        When deploying on Cloudflare Pages, make sure the final domain is also added in Supabase URL Configuration.
      </div>
    </section>
  `;
  throw new Error("Missing Supabase configuration.");
}

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const state = {
  session: null,
  profile: null,
  partners: [],
  submissions: [],
  myPartner: null,
  editingPartnerId: null,
  authMode: "signin",
  flash: null
};

init();

async function init() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session;

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    await bootstrap();
  });

  await bootstrap();
}

async function bootstrap() {
  renderLoading();

  if (!state.session) {
    state.profile = null;
    state.partners = [];
    state.submissions = [];
    state.myPartner = null;
    renderAuth();
    bindAuthEvents();
    return;
  }

  try {
    await ensureProfile();
    await syncPartnerLink();

    if (state.profile.role === "admin") {
      await loadAdminData();
      renderAdmin();
      bindAdminEvents();
    } else {
      await loadPartnerData();
      renderPartner();
      bindPartnerEvents();
    }
  } catch (error) {
    renderError(error.message || "Failed to load data. Check Supabase config and database setup.");
  }
}

async function ensureProfile() {
  const user = state.session.user;
  const normalizedEmail = user.email?.trim().toLowerCase();
  const fullName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    normalizedEmail?.split("@")[0] ||
    "Partner User";

  const { data: existing, error: queryError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (queryError) {
    throw queryError;
  }

  if (!existing) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: normalizedEmail,
      full_name: fullName
    });

    if (insertError) {
      throw insertError;
    }

    const { data: created, error: createdError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (createdError) {
      throw createdError;
    }

    state.profile = created;
    return;
  }

  const patch = {};
  if (existing.email !== normalizedEmail) {
    patch.email = normalizedEmail;
  }
  if (!existing.full_name && fullName) {
    patch.full_name = fullName;
  }

  if (Object.keys(patch).length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    state.profile = updated;
    return;
  }

  state.profile = existing;
}

async function syncPartnerLink() {
  if (state.profile.role === "admin" || state.profile.partner_id) {
    return;
  }

  const { data: partner, error } = await supabase
    .from("partners")
    .select("id")
    .ilike("contact_email", state.session.user.email?.trim().toLowerCase())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!partner) {
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ partner_id: partner.id })
    .eq("id", state.profile.id)
    .select("*")
    .single();

  if (updateError) {
    throw updateError;
  }

  state.profile = updated;
}

async function loadAdminData() {
  const [{ data: partners, error: partnersError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase.from("partners").select("*").order("created_at", { ascending: false }),
    supabase.from("renewal_submissions").select("*").order("submitted_at", { ascending: false })
  ]);

  if (partnersError) {
    throw partnersError;
  }
  if (submissionsError) {
    throw submissionsError;
  }

  state.partners = partners || [];
  state.submissions = submissions || [];
}

async function loadPartnerData() {
  if (!state.profile.partner_id) {
    state.myPartner = null;
    state.submissions = [];
    return;
  }

  const [{ data: partner, error: partnerError }, { data: submissions, error: submissionsError }] = await Promise.all([
    supabase.from("partners").select("*").eq("id", state.profile.partner_id).single(),
    supabase
      .from("renewal_submissions")
      .select("*")
      .eq("partner_id", state.profile.partner_id)
      .order("submitted_at", { ascending: false })
  ]);

  if (partnerError) {
    throw partnerError;
  }
  if (submissionsError) {
    throw submissionsError;
  }

  state.myPartner = partner;
  state.submissions = submissions || [];
}

function renderLoading() {
  app.innerHTML = `
    <section class="panel panel-loading">
      <p>Loading Partner Realm...</p>
    </section>
  `;
}

function renderError(message) {
  app.innerHTML = `
    <section class="panel">
      <h2>System Error</h2>
      <div class="notice notice-error">${escapeHtml(message)}</div>
    </section>
  `;
}

function renderAuth() {
  app.innerHTML = `
    <div class="grid-2">
      <section class="panel">
        <div class="auth-tabs">
          <button type="button" class="auth-tab ${state.authMode === "signin" ? "active" : ""}" data-auth-mode="signin">Email Sign In</button>
          <button type="button" class="auth-tab ${state.authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Email Sign Up</button>
        </div>
        <h2>${state.authMode === "signin" ? "Welcome Back" : "Create Account"}</h2>
        <p class="subtle">
          Admins and partners share the same sign-in entry. Access level is controlled by the <code>profiles.role</code> field.
        </p>
        ${renderFlash()}
        <form id="email-auth-form">
          ${state.authMode === "signup" ? `
            <label>
              Full Name
              <input type="text" name="full_name" placeholder="Your name" required>
            </label>
          ` : ""}
          <label>
            Email
            <input type="email" name="email" placeholder="name@example.com" required>
          </label>
          <label>
            Password
            <input type="password" name="password" placeholder="At least 6 characters" required>
          </label>
          <button class="button-primary" type="submit">${state.authMode === "signin" ? "Sign In" : "Sign Up and Send Verification Email"}</button>
        </form>
        <div class="spaced mini-actions">
          <button class="button-secondary" type="button" id="google-login">Continue with Google</button>
          <button class="button-secondary" type="button" id="reset-password">Send Password Reset Email</button>
        </div>
      </section>

      <section class="panel">
        <h2>What This System Does</h2>
        <ul class="helper-list">
          <li>Admins can create and manage partner records, contacts, status, and renewal dates.</li>
          <li>Partners can sign in with email or Google and upload payment screenshots.</li>
          <li>The dashboard highlights pending submissions and upcoming renewals.</li>
          <li>The project is ready for GitHub hosting and Cloudflare Pages custom domain binding.</li>
        </ul>
      </section>
    </div>
  `;
}

function renderAdmin() {
  const stats = getAdminStats();
  const pendingSubmissions = state.submissions.filter((item) => item.status === "pending");

  app.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div class="user-meta">
          <h2>Admin Console</h2>
          <span class="pill pill-admin">Admin</span>
          <span class="subtle">${escapeHtml(state.profile.full_name || state.profile.email)}</span>
        </div>
        <div class="mini-actions">
          <button type="button" class="button-secondary" id="refresh-admin">Refresh</button>
          <button type="button" class="button-secondary" id="logout">Log Out</button>
        </div>
      </div>
      ${renderFlash()}
      <div class="grid-3">
        <article class="kpi-card">
          <span class="subtle">Total Partners</span>
          <strong class="kpi-number">${stats.totalPartners}</strong>
        </article>
        <article class="kpi-card">
          <span class="subtle">Due Within 7 Days</span>
          <strong class="kpi-number">${stats.dueSoon}</strong>
        </article>
        <article class="kpi-card">
          <span class="subtle">Pending Submissions</span>
          <strong class="kpi-number">${stats.pending}</strong>
        </article>
      </div>
    </section>

    <div class="grid-2">
      <section class="panel">
        <h3>${state.editingPartnerId ? "Edit Partner" : "Add Partner"}</h3>
        <p class="subtle">If a partner signs in with the same email as the contact email below, the system links that account automatically.</p>
        <form id="partner-form">
          <div class="field-grid">
            <label>
              Company / Partner Name
              <input type="text" name="company_name" required>
            </label>
            <label>
              Contact Name
              <input type="text" name="contact_name" required>
            </label>
          </div>
          <div class="field-grid">
            <label>
              Contact Email
              <input type="email" name="contact_email" required>
            </label>
            <label>
              Status
              <select name="status">
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="pending">pending</option>
              </select>
            </label>
          </div>
          <div class="field-grid">
            <label>
              Next Renewal Date
              <input type="date" name="renewal_due_date" required>
            </label>
            <label>
              Last Payment Date
              <input type="date" name="last_payment_date">
            </label>
          </div>
          <label>
            Notes
            <textarea name="notes" placeholder="Pricing plan, invoice notes, partner tier, or follow-up remarks"></textarea>
          </label>
          <div class="mini-actions">
            <button type="submit" class="button-primary">${state.editingPartnerId ? "Save Changes" : "Create Partner"}</button>
            <button type="button" class="button-secondary" id="clear-partner-form">Clear Form</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <h3>Pending Renewal Screenshots</h3>
        <div class="card-list">
          ${pendingSubmissions.length ? pendingSubmissions.map(renderSubmissionCard).join("") : '<div class="empty-state">No pending renewal screenshots right now.</div>'}
        </div>
      </section>
    </div>

    <section class="panel">
      <div class="toolbar">
        <div>
          <h3>Partner Directory</h3>
          <p class="subtle">Review renewal status for every partner and jump into edit mode from the table below.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Partner</th>
              <th>Contact</th>
              <th>Renewal Status</th>
              <th>Last Payment</th>
              <th>Next Renewal</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.partners.length ? state.partners.map(renderPartnerRow).join("") : '<tr><td colspan="7">No partners created yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h3>All Renewal Submissions</h3>
      <div class="card-list">
        ${state.submissions.length ? state.submissions.map(renderSubmissionCard).join("") : '<div class="empty-state">No screenshots have been submitted yet.</div>'}
      </div>
    </section>
  `;

  bindPartnerFormValues();
}

function renderPartner() {
  const renewalMeta = state.myPartner ? getRenewalMeta(state.myPartner.renewal_due_date) : null;

  app.innerHTML = `
    <section class="panel">
      <div class="toolbar">
        <div class="user-meta">
          <h2>Partner Portal</h2>
          <span class="pill pill-partner">Partner</span>
          <span class="subtle">${escapeHtml(state.profile.full_name || state.profile.email)}</span>
        </div>
        <div class="mini-actions">
          <button type="button" class="button-secondary" id="refresh-partner">Refresh</button>
          <button type="button" class="button-secondary" id="logout">Log Out</button>
        </div>
      </div>
      ${renderFlash()}
      ${!state.myPartner ? `
        <div class="notice notice-info">
          This account is not linked to a partner record yet. Ask an admin to create a partner entry using the same email address as your login.
        </div>
      ` : `
        <div class="grid-2">
          <article class="partner-card">
            <div class="card-head">
              <div>
                <h3>${escapeHtml(state.myPartner.company_name)}</h3>
                <p class="subtle">Contact: ${escapeHtml(state.myPartner.contact_name)} / ${escapeHtml(state.myPartner.contact_email)}</p>
              </div>
              <span class="pill ${renewalMeta.className}">${renewalMeta.label}</span>
            </div>
            <div class="meta-grid">
              <div class="meta-item">
                <span class="meta-label">Last Payment Date</span>
                <strong>${formatDate(state.myPartner.last_payment_date)}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">Next Renewal Date</span>
                <strong>${formatDate(state.myPartner.renewal_due_date)}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">Partner Status</span>
                <strong>${escapeHtml(state.myPartner.status)}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">Admin Notes</span>
                <strong>${escapeHtml(state.myPartner.notes || "No notes yet")}</strong>
              </div>
            </div>
          </article>

          <article class="panel">
            <h3>Upload Reading Payment Screenshot</h3>
            <p class="subtle">After submission, an admin can review it and update your next renewal date.</p>
            <form id="submission-form">
              <div class="field-grid">
                <label>
                  Payment Month
                  <input type="month" name="payment_month" required>
                </label>
                <label>
                  Amount
                  <input type="number" name="amount" min="0" step="0.01" placeholder="0.00" required>
                </label>
              </div>
              <label>
                Screenshot
                <input type="file" name="screenshot" accept="image/png,image/jpeg,image/webp" required>
              </label>
              <label>
                Notes
                <textarea name="notes" placeholder="Payment channel, transfer reference, or extra context"></textarea>
              </label>
              <button type="submit" class="button-primary">Submit Screenshot</button>
            </form>
          </article>
        </div>
      `}
    </section>

    <section class="panel">
      <h3>My Submission History</h3>
      <div class="card-list">
        ${state.submissions.length ? state.submissions.map(renderSubmissionCard).join("") : '<div class="empty-state">You have not submitted any renewal screenshot yet.</div>'}
      </div>
    </section>
  `;
}

function renderFlash() {
  if (!state.flash) {
    return "";
  }
  return `<div class="notice notice-${state.flash.type} spaced">${escapeHtml(state.flash.message)}</div>`;
}

function renderPartnerRow(partner) {
  const renewal = getRenewalMeta(partner.renewal_due_date);
  return `
    <tr>
      <td>
        <strong>${escapeHtml(partner.company_name)}</strong><br>
        <span class="subtle">${escapeHtml(partner.status)}</span>
      </td>
      <td>
        ${escapeHtml(partner.contact_name)}<br>
        <span class="subtle">${escapeHtml(partner.contact_email)}</span>
      </td>
      <td><span class="pill ${renewal.className}">${renewal.label}</span></td>
      <td>${formatDate(partner.last_payment_date)}</td>
      <td>${formatDate(partner.renewal_due_date)}</td>
      <td>${escapeHtml(partner.notes || "-")}</td>
      <td>
        <div class="mini-actions">
          <button type="button" class="button-secondary" data-edit-partner="${partner.id}">Edit</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSubmissionCard(submission) {
  const partner = state.partners.find((item) => item.id === submission.partner_id) || state.myPartner;
  const badgeClass =
    submission.status === "approved"
      ? "pill-approved"
      : submission.status === "rejected"
        ? "pill-rejected"
        : "pill-pending";

  return `
    <article class="submission-card">
      <div class="card-head">
        <div>
          <h4>${escapeHtml(partner?.company_name || "Unknown Partner")}</h4>
          <p class="subtle">Submitted: ${formatDateTime(submission.submitted_at)}</p>
        </div>
        <span class="pill ${badgeClass}">${escapeHtml(submission.status)}</span>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Payment Month</span>
          <strong>${escapeHtml(submission.payment_month || "-")}</strong>
        </div>
        <div class="meta-item">
          <span class="meta-label">Amount</span>
          <strong>${submission.amount ? `¥${Number(submission.amount).toFixed(2)}` : "-"}</strong>
        </div>
        <div class="meta-item">
          <span class="meta-label">Contact Email</span>
          <strong>${escapeHtml(partner?.contact_email || "-")}</strong>
        </div>
        <div class="meta-item">
          <span class="meta-label">Notes</span>
          <strong>${escapeHtml(submission.notes || "-")}</strong>
        </div>
      </div>
      <div class="card-actions spaced">
        <div class="mini-actions">
          <button type="button" class="button-link" data-open-screenshot="${submission.file_path}">View Screenshot</button>
          ${state.profile?.role === "admin" && submission.status === "pending" ? `
            <button type="button" class="button-primary" data-approve-submission="${submission.id}" data-partner-id="${submission.partner_id}">Approve</button>
            <button type="button" class="button-danger" data-reject-submission="${submission.id}">Reject</button>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function bindAuthEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      clearFlash();
      renderAuth();
      bindAuthEvents();
    });
  });

  document.getElementById("email-auth-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFlash();

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString().trim().toLowerCase();
    const password = formData.get("password")?.toString().trim();
    const fullName = formData.get("full_name")?.toString().trim();

    try {
      if (state.authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          throw error;
        }
        setFlash("success", "Signed in successfully.");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: config.siteUrl || window.location.origin,
            data: { full_name: fullName }
          }
        });

        if (error) {
          throw error;
        }

        setFlash("success", "Account created. Please verify your email before signing in.");
        renderAuth();
        bindAuthEvents();
      }
    } catch (error) {
      setFlash("error", error.message || "Authentication failed.");
      renderAuth();
      bindAuthEvents();
    }
  });

  document.getElementById("google-login")?.addEventListener("click", async () => {
    clearFlash();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: config.siteUrl || window.location.origin
      }
    });

    if (error) {
      setFlash("error", error.message || "Google sign-in failed.");
      renderAuth();
      bindAuthEvents();
    }
  });

  document.getElementById("reset-password")?.addEventListener("click", async () => {
    const email = window.prompt("Enter the email address that should receive the password reset link.");
    if (!email) {
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: config.siteUrl || window.location.origin
    });

    if (error) {
      setFlash("error", error.message || "Failed to send password reset email.");
    } else {
      setFlash("success", "Password reset email sent.");
    }

    renderAuth();
    bindAuthEvents();
  });
}

function bindAdminEvents() {
  document.getElementById("logout")?.addEventListener("click", handleLogout);
  document.getElementById("refresh-admin")?.addEventListener("click", async () => {
    clearFlash();
    await bootstrap();
  });

  document.getElementById("partner-form")?.addEventListener("submit", handlePartnerSave);
  document.getElementById("clear-partner-form")?.addEventListener("click", () => {
    state.editingPartnerId = null;
    clearFlash();
    renderAdmin();
    bindAdminEvents();
  });

  document.querySelectorAll("[data-edit-partner]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingPartnerId = button.dataset.editPartner;
      clearFlash();
      renderAdmin();
      bindAdminEvents();
    });
  });

  document.querySelectorAll("[data-open-screenshot]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openScreenshot(button.dataset.openScreenshot);
    });
  });

  document.querySelectorAll("[data-approve-submission]").forEach((button) => {
    button.addEventListener("click", async () => {
      const submissionId = button.dataset.approveSubmission;
      const partnerId = button.dataset.partnerId;
      const nextDueDate = window.prompt("Enter the next renewal date in YYYY-MM-DD format.");
      if (!nextDueDate) {
        return;
      }
      await approveSubmission(submissionId, partnerId, nextDueDate);
    });
  });

  document.querySelectorAll("[data-reject-submission]").forEach((button) => {
    button.addEventListener("click", async () => {
      const submissionId = button.dataset.rejectSubmission;
      const reason = window.prompt("Enter the rejection reason.");
      if (!reason) {
        return;
      }
      await rejectSubmission(submissionId, reason);
    });
  });
}

function bindPartnerEvents() {
  document.getElementById("logout")?.addEventListener("click", handleLogout);
  document.getElementById("refresh-partner")?.addEventListener("click", async () => {
    clearFlash();
    await bootstrap();
  });

  document.getElementById("submission-form")?.addEventListener("submit", handleSubmissionSave);
  document.querySelectorAll("[data-open-screenshot]").forEach((button) => {
    button.addEventListener("click", async () => {
      await openScreenshot(button.dataset.openScreenshot);
    });
  });
}

function bindPartnerFormValues() {
  const form = document.getElementById("partner-form");
  if (!form) {
    return;
  }

  if (!state.editingPartnerId) {
    form.reset();
    const renewalInput = form.querySelector('input[name="renewal_due_date"]');
    if (renewalInput) {
      renewalInput.value = getDateInputValue(addDays(new Date(), 30));
    }
    return;
  }

  const partner = state.partners.find((item) => item.id === state.editingPartnerId);
  if (!partner) {
    return;
  }

  form.company_name.value = partner.company_name || "";
  form.contact_name.value = partner.contact_name || "";
  form.contact_email.value = partner.contact_email || "";
  form.status.value = partner.status || "active";
  form.renewal_due_date.value = partner.renewal_due_date || "";
  form.last_payment_date.value = partner.last_payment_date || "";
  form.notes.value = partner.notes || "";
}

async function handlePartnerSave(event) {
  event.preventDefault();
  clearFlash();

  const formData = new FormData(event.currentTarget);
  const payload = {
    company_name: formData.get("company_name")?.toString().trim(),
    contact_name: formData.get("contact_name")?.toString().trim(),
    contact_email: formData.get("contact_email")?.toString().trim().toLowerCase(),
    status: formData.get("status")?.toString(),
    renewal_due_date: formData.get("renewal_due_date")?.toString(),
    last_payment_date: formData.get("last_payment_date")?.toString() || null,
    notes: formData.get("notes")?.toString().trim() || null
  };

  try {
    if (state.editingPartnerId) {
      const { error } = await supabase.from("partners").update(payload).eq("id", state.editingPartnerId);
      if (error) {
        throw error;
      }
      setFlash("success", "Partner updated.");
    } else {
      const { error } = await supabase.from("partners").insert({
        ...payload,
        created_by: state.profile.id
      });
      if (error) {
        throw error;
      }
      setFlash("success", "Partner created.");
    }

    state.editingPartnerId = null;
    await bootstrap();
  } catch (error) {
    setFlash("error", error.message || "Failed to save partner.");
    renderAdmin();
    bindAdminEvents();
  }
}

async function handleSubmissionSave(event) {
  event.preventDefault();
  clearFlash();

  if (!state.myPartner) {
    setFlash("error", "This account is not linked to a partner record.");
    renderPartner();
    bindPartnerEvents();
    return;
  }

  const formData = new FormData(event.currentTarget);
  const file = formData.get("screenshot");

  if (!(file instanceof File) || !file.size) {
    setFlash("error", "Please choose a screenshot before submitting.");
    renderPartner();
    bindPartnerEvents();
    return;
  }

  try {
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const safeName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
    const filePath = `${state.myPartner.id}/${state.profile.id}/${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(config.screenshotBucket)
      .upload(filePath, file, {
        upsert: false,
        cacheControl: "3600"
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: insertError } = await supabase.from("renewal_submissions").insert({
      partner_id: state.myPartner.id,
      submitted_by: state.profile.id,
      payment_month: formData.get("payment_month")?.toString(),
      amount: Number(formData.get("amount")),
      notes: formData.get("notes")?.toString().trim() || null,
      file_path: filePath
    });

    if (insertError) {
      throw insertError;
    }

    setFlash("success", "Screenshot submitted successfully.");
    await bootstrap();
  } catch (error) {
    setFlash("error", error.message || "Upload failed.");
    renderPartner();
    bindPartnerEvents();
  }
}

async function approveSubmission(submissionId, partnerId, nextDueDate) {
  clearFlash();

  try {
    const { error: submissionError } = await supabase
      .from("renewal_submissions")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: state.profile.id,
        review_notes: `Approved by ${state.profile.email}`
      })
      .eq("id", submissionId);

    if (submissionError) {
      throw submissionError;
    }

    const { error: partnerError } = await supabase
      .from("partners")
      .update({
        last_payment_date: new Date().toISOString().slice(0, 10),
        renewal_due_date: nextDueDate
      })
      .eq("id", partnerId);

    if (partnerError) {
      throw partnerError;
    }

    setFlash("success", "Submission approved and renewal date updated.");
    await bootstrap();
  } catch (error) {
    setFlash("error", error.message || "Approval failed.");
    renderAdmin();
    bindAdminEvents();
  }
}

async function rejectSubmission(submissionId, reason) {
  clearFlash();
  try {
    const { error } = await supabase
      .from("renewal_submissions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: state.profile.id,
        review_notes: reason
      })
      .eq("id", submissionId);

    if (error) {
      throw error;
    }

    setFlash("success", "Submission rejected.");
    await bootstrap();
  } catch (error) {
    setFlash("error", error.message || "Rejection failed.");
    renderAdmin();
    bindAdminEvents();
  }
}

async function openScreenshot(filePath) {
  const { data, error } = await supabase.storage
    .from(config.screenshotBucket)
    .createSignedUrl(filePath, 60);

  if (error) {
    setFlash("error", error.message || "Unable to open screenshot.");
    if (state.profile?.role === "admin") {
      renderAdmin();
      bindAdminEvents();
    } else {
      renderPartner();
      bindPartnerEvents();
    }
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function handleLogout() {
  await supabase.auth.signOut();
  state.editingPartnerId = null;
  clearFlash();
  renderAuth();
  bindAuthEvents();
}

function setFlash(type, message) {
  state.flash = { type, message };
}

function clearFlash() {
  state.flash = null;
}

function getAdminStats() {
  return {
    totalPartners: state.partners.length,
    dueSoon: state.partners.filter((partner) => getRenewalMeta(partner.renewal_due_date).level === "due-soon").length,
    pending: state.submissions.filter((submission) => submission.status === "pending").length
  };
}

function getRenewalMeta(dateText) {
  if (!dateText) {
    return { label: "Not Set", className: "pill-pending", level: "pending" };
  }

  const due = new Date(`${dateText}T00:00:00`);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diff < 0) {
    return { label: `Expired ${Math.abs(diff)} days`, className: "pill-expired", level: "expired" };
  }
  if (diff <= 7) {
    return { label: `Due in ${diff} days`, className: "pill-due-soon", level: "due-soon" };
  }
  return { label: `${diff} days remaining`, className: "pill-active", level: "active" };
}

function formatDate(dateText) {
  if (!dateText) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium" }).format(new Date(`${dateText}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function getDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
