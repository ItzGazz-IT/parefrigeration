# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

## SQL API setup

This project now includes a backend API in `server/index.js` that connects to MySQL.

1. Create/update `.env` in the project root:

	- `DB_HOST`
	- `DB_USER`
	- `DB_PASSWORD`
	- `DB_NAME`
	- `DB_PORT` (default `3306`)
	- `API_PORT` (default `5000`)

2. Run frontend + API together:

	```bash
	npm run dev
	```

3. Run in production after building the React app:

	```bash
	npm run build
	npm run start:prod
	```

	The Express server will serve both the API and the built React app from the same domain.

4. API endpoints:

	- `GET /api/health`
	- `GET /api/dashboard/summary`
	- `GET /api/dashboard/recent-units`
	- `GET /api/dashboard/weekly-report`
	- `POST /api/scanout/process`

## Scan-out workflow API

`POST /api/scanout/process` body:

- `scanType`: `ACTUAL_SALE | TFFW_EXCHANGE | INHOUSE_EXCHANGE | TAKEALOT | TFF_DEALER`
- `serialNumber` (required for all)
- `clientName`, `invoiceType`, `invoiceNumber`, `ioNumber`, `poNumber`, `scannedBy` (required by scan type rules)

Rules implemented:

- `ACTUAL_SALE`: requires invoice type + invoice number + client, marks SOLD, payment `UNPAID_TFFW`, included in weekly report.
- `TFFW_EXCHANGE`: requires IO number + client, marks SOLD, payment `PAID_TFFW`, not included in weekly report.
- `INHOUSE_EXCHANGE`: requires client, marks SOLD, payment `UNPAID_INHOUSE`, included in weekly report.
- `TAKEALOT`: requires PO number, marks SOLD, payment `PENDING_IO` (or `UNPAID_TFFW` once IO is supplied), not included in weekly report.
- `TFF_DEALER`: requires IO number + client, marks SOLD, payment `PAID_TFFW`, not included in weekly report.

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
