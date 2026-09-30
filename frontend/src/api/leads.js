export async function submitLead(lead) {
  let response;
  try {
    response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lead),
    });
  } catch {
    throw new Error('Connection lost. Please check your internet and try again.');
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

export async function getLeadStatus(id) {
  const response = await fetch(`/api/leads/${encodeURIComponent(id)}/status`);
  if (!response.ok) throw new Error('Could not check delivery status.');
  return response.json();
}
