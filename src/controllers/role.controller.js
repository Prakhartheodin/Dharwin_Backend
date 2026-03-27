import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import ApiError from '../utils/ApiError.js';
import catchAsync from '../utils/catchAsync.js';
import * as roleService from '../services/role.service.js';
import * as activityLogService from '../services/activityLog.service.js';
import { ActivityActions, EntityTypes } from '../config/activityLog.js';

const createRole = catchAsync(async (req, res) => {
  const role = await roleService.createRole(req.body);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.ROLE_CREATE,
    EntityTypes.ROLE,
    role.id,
    { name: role.name, roleName: role.name },
    req
  );
  res.status(httpStatus.CREATED).send(role);
});

const getRoles = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'status']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await roleService.queryRoles(filter, options);
  res.send(result);
});

const getRole = catchAsync(async (req, res) => {
  const role = await roleService.getRoleById(req.params.roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  res.send(role);
});

const updateRole = catchAsync(async (req, res) => {
  const before = await roleService.getRoleById(req.params.roleId);
  if (!before) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  const role = await roleService.updateRoleById(req.params.roleId, req.body);
  const metadata = { roleName: role.name };
  const fieldsUpdated = Object.keys(req.body).filter(
    (k) => Object.prototype.hasOwnProperty.call(req.body, k) && req.body[k] !== undefined
  );
  if (fieldsUpdated.length) {
    metadata.fieldsUpdated = fieldsUpdated;
  }
  if (req.body.name !== undefined && String(req.body.name) !== String(before.name)) {
    metadata.nameBefore = before.name;
    metadata.nameAfter = role.name;
  }
  if (req.body.status !== undefined && String(req.body.status) !== String(before.status)) {
    metadata.statusBefore = before.status;
    metadata.statusAfter = role.status;
  }
  if (req.body.permissions !== undefined) {
    metadata.permissionsUpdated = true;
    metadata.permissionCountBefore = before.permissions?.length ?? 0;
    metadata.permissionCountAfter = role.permissions?.length ?? 0;
  }
  const assigneeSnapshot = await roleService.getRoleAssigneeDisplaySnapshot(role.id);
  Object.assign(metadata, assigneeSnapshot);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.ROLE_UPDATE,
    EntityTypes.ROLE,
    role.id,
    metadata,
    req
  );
  res.send(role);
});

const deleteRole = catchAsync(async (req, res) => {
  const role = await roleService.deleteRoleById(req.params.roleId);
  await activityLogService.createActivityLog(
    req.user.id,
    ActivityActions.ROLE_DELETE,
    EntityTypes.ROLE,
    req.params.roleId,
    { name: role.name, roleName: role.name },
    req
  );
  res.status(httpStatus.NO_CONTENT).send();
});

export {
  createRole,
  getRoles,
  getRole,
  updateRole,
  deleteRole,
};
