const allRoles = {
  user: ['getUsers', 'manageUsers'],
  recruiter: ['getUsers', 'manageCandidates', 'manageJobs'],
};

const roles = Object.keys(allRoles);
const roleRights = new Map(Object.entries(allRoles));

export { roles, roleRights };
