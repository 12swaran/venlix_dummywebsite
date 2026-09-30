import { useEffect, useState } from 'react';
import { getLeadStatus, submitLead } from '../api/leads.js';

const initialValues = { name: '', email: '', phone: '', company: '', industry: '', interest: '', message: '' };

export default function LeadForm() {
  const [values, setValues] = useState(initialValues);
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [pendingLeadId, setPendingLeadId] = useState(null);

  useEffect(() => {
    if (!pendingLeadId) return undefined;
    const timer = setInterval(async () => {
      try {
        const result = await getLeadStatus(pendingLeadId);
        if (result.crmSync === 'sent') {
          setPendingLeadId(null);
          setState('success');
        }
      } catch {
        // Keep the saved-but-pending state visible while status is unavailable.
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [pendingLeadId]);

  function change(event) {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
    if (state !== 'idle' && state !== 'submitting') {
      setState('idle');
      setPendingLeadId(null);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (state === 'submitting') return;
    setState('submitting');
    setError('');
    try {
      const result = await submitLead(values);
      setValues(initialValues);
      if (result.crmSync === 'sent') {
        setState('success');
      } else {
        setPendingLeadId(result.id);
        setState('pending');
      }
    } catch (submissionError) {
      setError(submissionError.message);
      setState('error');
    }
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Full name <b>*</b></span>
          <input name="name" autoComplete="name" value={values.name} onChange={change} placeholder="Your name" maxLength="100" required />
        </label>
        <label className="field">
          <span>Work email <b>*</b></span>
          <input name="email" type="email" autoComplete="email" value={values.email} onChange={change} placeholder="you@company.com" maxLength="254" required />
        </label>
        <label className="field">
          <span>Phone number <b>*</b></span>
          <input name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={change} placeholder="+91 98765 43210" maxLength="40" required />
        </label>
        <label className="field">
          <span>Company</span>
          <input name="company" autoComplete="organization" value={values.company} onChange={change} placeholder="Company name" maxLength="120" />
        </label>
        <label className="field">
          <span>Industry</span>
          <select name="industry" value={values.industry} onChange={change}>
            <option value="">Select an industry</option>
            <option>Technology</option>
            <option>Healthcare</option>
            <option>Finance</option>
            <option>Education</option>
            <option>Professional services</option>
            <option>Other</option>
          </select>
        </label>
        <label className="field">
          <span>Interested in</span>
          <select name="interest" value={values.interest} onChange={change}>
            <option value="">What can we help with?</option>
            <option>Workplace wellbeing</option>
            <option>Expert consultations</option>
            <option>Healthy habits</option>
            <option>Not sure yet</option>
          </select>
        </label>
        <label className="field field-wide">
          <span>Anything else we should know?</span>
          <textarea name="message" value={values.message} onChange={change} placeholder="Tell us a little about what you're looking for" rows="4" maxLength="1000" />
        </label>
      </div>
      <p className="form-note">Please avoid including personal health information. Fields marked * are required.</p>
      {state === 'error' && <p className="form-feedback error" role="alert">{error}</p>}
      {state === 'success' && <p className="form-feedback success" role="status">Thank you — your request was saved and delivered.</p>}
      {state === 'pending' && <p className="form-feedback pending" role="status">Your request was saved, but delivery to Venlix CRM is delayed. We’ll retry automatically.</p>}
      <button className="button button-dark form-submit" type="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Sending your request…' : 'Request a conversation'}
        {state !== 'submitting' && <span aria-hidden="true">↗</span>}
      </button>
    </form>
  );
}
