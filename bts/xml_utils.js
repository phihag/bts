const pd = require('pretty-data').pd;
const {XMLSerializer} = require('xmldom');

function serialize_pretty(doc) {
	// pd only takes XML, so serialize once
	const xml = (new XMLSerializer()).serializeToString(doc);

	return pd.xml(xml);
}

module.exports = {
	serialize_pretty,
};
