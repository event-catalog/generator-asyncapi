type Props = {
  path: string;
};

import utils from '@eventcatalog/sdk';

export default (config: any, options: Props) => {
  // if (!process.env.PROJECT_DIR) {
  //   throw new Error('Please provide catalog url (env variable PROJECT_DIR)');
  // }

  console.log('process.env.PROJECT_DIR', process.env.PROJECT_DIR);

};
