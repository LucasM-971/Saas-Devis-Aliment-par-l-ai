import type { Lead } from '@/types';

export type LeadFilter = 'tous' | 'convertis' | 'a_traiter';

// Un prospect est converti dès qu'il est rattaché à un devis.
export function isConverted(lead: Lead): boolean {
  return Boolean(lead.quoteId);
}

// Filtre les prospects par état de conversion puis par recherche (nom ou email).
export function filterLeads(leads: Lead[], filter: LeadFilter, search: string): Lead[] {
  const needle = search.trim().toLowerCase();
  return leads.filter((lead) => {
    if (filter === 'convertis' && !isConverted(lead)) return false;
    if (filter === 'a_traiter' && isConverted(lead)) return false;
    if (!needle) return true;
    return (
      lead.name.toLowerCase().includes(needle) || lead.email.toLowerCase().includes(needle)
    );
  });
}

export type LeadStats = {
  total: number;
  convertis: number;
  aTraiter: number;
  tauxConversion: number; // convertis / total, ratio 0..1
};

// Agrège les indicateurs de la page Prospects.
export function computeLeadStats(leads: Lead[]): LeadStats {
  const convertis = leads.filter(isConverted).length;
  return {
    total: leads.length,
    convertis,
    aTraiter: leads.length - convertis,
    tauxConversion: leads.length === 0 ? 0 : convertis / leads.length,
  };
}
