import { Volunteer } from '../domain/types';

// A small roster for trying the server by hand. With nobody having refilled
// yet, offers go in employeeId order: ingrid first in Oslo, aarav in Bengaluru.
export const DEMO_ROSTER: Volunteer[] = [
  oslo('ingrid', 'Ingrid', 'OFFICE'),
  oslo('lars', 'Lars', 'OFFICE'),
  oslo('nora', 'Nora', 'OFFICE'),
  oslo('erik', 'Erik', 'REMOTE'),
  bengaluru('aarav', 'Aarav', 'OFFICE'),
  bengaluru('diya', 'Diya', 'OFFICE'),
  bengaluru('kabir', 'Kabir', 'OFFICE'),
  bengaluru('meera', 'Meera', 'AWAY'),
  // Visiting Oslo this week: joins the Oslo rotation, paid in INR by HR.
  {
    employeeId: 'priya',
    name: 'Priya',
    homeOffice: 'BENGALURU',
    payrollCurrency: 'INR',
    currentOffice: 'OSLO',
    availability: 'OFFICE',
    optedIn: true,
  },
];

function oslo(employeeId: string, name: string, availability: Volunteer['availability']): Volunteer {
  return {
    employeeId,
    name,
    homeOffice: 'OSLO',
    payrollCurrency: 'NOK',
    currentOffice: 'OSLO',
    availability,
    optedIn: true,
  };
}

function bengaluru(employeeId: string, name: string, availability: Volunteer['availability']): Volunteer {
  return {
    employeeId,
    name,
    homeOffice: 'BENGALURU',
    payrollCurrency: 'INR',
    currentOffice: 'BENGALURU',
    availability,
    optedIn: true,
  };
}
