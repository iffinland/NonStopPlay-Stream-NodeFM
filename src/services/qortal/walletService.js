import { requestQortal } from './qortalClient.js';

export const getUserAccount = async () => {
  return requestQortal({
    action: 'GET_USER_ACCOUNT',
  });
};

export const getNameData = async (name) => {
  return requestQortal({
    action: 'GET_NAME_DATA',
    name,
  });
};
