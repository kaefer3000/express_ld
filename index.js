/* we'll write proper js code */
"use strict";

const httpPort = 80;

// Load a LRU cache implementation
const LRUcache = require('lru-cache-js')
// Load the web framework
const express = require('express');
// Load the logger for the web framework
const logger = require('morgan');
// Load some parsers for HTTP message bodys
const bodyParser = require('body-parser');
// To make HTTP requests
const request = require('request');
// Load RDF
const rdf = require('rdf-ext')
// Load the RDF parsers for HTTP messages
const rdfBodyParser = require('rdf-body-parser');
const RdfXmlSerializer = require('rdf-serializer-rdfxml');

// The root app
const app = express();
app.use(logger('dev'));

// Preparing to use my rdf/xml serialiser
const formatparams = {};
formatparams.serializers = new rdf.Serializers();
formatparams.serializers['application/rdf+xml'] = RdfXmlSerializer;
// Registering the serialiser with the common serialisers/parsers
const formats = require('rdf-formats-common')(formatparams);

// Configuring a body parser to using Turtle as default media type, and registering the formats
const configuredBodyParser = rdfBodyParser({'defaultMediaType' : 'text/turtle', 'formats' : formats});

// Registering the body parser with the app
app.use(configuredBodyParser);


function NamespaceManager(rdftermcache) {
  this.termcache = rdftermcache;
  this.ns = {};
};
NamespaceManager.prototype.createNamespace = function(prefix, IRI) {
  const that = this;
  this.ns[prefix] = function(localname) {
    return that.termcache.getIRI(IRI + localname);
  };
};

function RdfTermCache(overallsize) {
  // defaulting if nothing or rubbish is supplied:
  if (typeof overallsize !== "number")
    overallsize = 48;

  var individualsize = Math.floor(overallsize / 3);
  this.iris = new LRUcache(individualsize);
  this.bnodes = new LRUcache(individualsize);
  this.literals = new LRUcache(individualsize);
};
RdfTermCache.prototype.getIRI = function(string) {
  var iri = this.iris.get(string);
  if (iri === null) {
    iri = new rdf.NamedNode(string)
    this.iris.put(string, iri);
  }
  return iri;
};
RdfTermCache.prototype.getBlankNode = function(string) {
  var bnode = this.bnodes.get(string);
  if (bnode === null) {
    bnode = new rdf.BlankNode(string);
    this.bnodes.put(string, bnode);
  }
  return bnode;
};
RdfTermCache.prototype.getLiteral = function(lexicalValue, language, datatype, native) {
  // Double quotes because they do not appear un-escaped in literals
  var key = lexicalValue + '"' + language + '"' + datatype + '"' + native;
  var literal = this.literals.get(key);
  if (literal === null) {
    literal = new rdf.Literal(lexicalValue, language, datatype, native);
    this.literals.put(key, literal);
  }
  return literal;
};

const cache = new RdfTermCache(50);
const nsm = new NamespaceManager(cache);
nsm.createNamespace('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
nsm.createNamespace('ldp', 'http://www.w3.org/ns/ldp#');
nsm.createNamespace('schema', 'http://schema.org/');

// Where the data will be stored
let collection = {};
// Increment for POST requests
let nextCollectionIdxToCheck = 0;

const rootGraph = rdf.createGraph();
rootGraph.addAll(
  [
    new rdf.Triple(
      cache.getIRI(''),
      nsm.ns.rdf('type'),
      nsm.ns.ldp('BasicContainer'))
  ]
);

/**
 * GET root
 */
app.get('/', (req, res) => {
  const contentGraph = [];
  Object.keys(collection).forEach((o) => {
    contentGraph.push(
      new rdf.Triple(
        cache.getIRI(''),
        nsm.ns.ldp('contains'),
        cache.getIRI(o.toString())
      )
    );
  });
  res.sendGraph(rootGraph.merge(contentGraph));
});

/**
 * GET entry of collection
 */
app.get('/:id', (req, res) => {
  if (!(req.params.id in collection)) {
    res.sendStatus(404);
    return;
  } else {
    if ('text' in collection[req.params.id])
      res.sendGraph(rdf.createGraph([rdf.createTriple(cache.getIRI('#it'), nsm.ns.schema('text'), cache.getLiteral(collection[req.params.id].text))]));
    else if ('image' in collection[req.params.id])
      res.sendGraph(rdf.createGraph([rdf.createTriple(cache.getIRI('#it'), nsm.ns.schema('image'), cache.getIRI(collection[req.params.id].image))]));
    else
      res.sendStatus(500);
  }
});

/**
 * POST something to collection
 */
app.post('/', (req, res) => {
  if (!req.graph) {
    res.status(400);
    res.send("Please supply a parseable graph.");
    return;
  }
  do {
  ++nextCollectionIdxToCheck;
  } while (nextCollectionIdxToCheck - 1 in collection);
  
  var targetStateTripleCount = 0;
  var statetriple;
  req.graph.filter(
    function(triple) {
      return triple.predicate.nominalValue === 'http://schema.org/text' || triple.predicate.nominalValue === 'http://schema.org/image'
        }).forEach(function(triple) {
          ++targetStateTripleCount;
          statetriple = triple;
        });
  if (targetStateTripleCount === 0 || targetStateTripleCount > 1) {
      res.status(400);
      res.send('Please supply exactly one triple with predicate http://schema.org/text or http://schema.org/image\n');
      return;
  }

  switch (statetriple.predicate.nominalValue) {
    case "http://schema.org/text":
      if (statetriple.object.interfaceName !== "Literal") {
        res.status(400);
        res.send("Please supply a Literal in object position");
        return;
      }
      collection[nextCollectionIdxToCheck - 1] = { "text" : statetriple.object.nominalValue } ;
      break;
    case "http://schema.org/image":
      if (statetriple.object.interfaceName !== "NamedNode") {
        res.status(400);
        res.send("Please supply an URI in object position");
        return;
      }
      collection[nextCollectionIdxToCheck - 1] = { "image" : statetriple.object.nominalValue } ;
      break;
    default:
      res.status(400);
      res.send('Please supply a triple with saref:hasState as predicate and saref:Off or saref:On as object\n');
      return;
  };

  res.location(nextCollectionIdxToCheck - 1);
  res.sendStatus(201);
});

/**
 * PUT something to collection
 */
app.put('/:id', (req, res) => {
  if (!req.graph) {
    res.status(400);
    res.send("Please supply a parseable graph.");
    return;
  }

  let overwriting = false;
  if (req.params.id in collection)
    overwriting = true;

  var targetStateTripleCount = 0;
  var statetriple;
  req.graph.filter(
    function(triple) {
      return triple.predicate.nominalValue === 'http://schema.org/text' || triple.predicate.nominalValue === 'http://schema.org/image'
        }).forEach(function(triple) {
          ++targetStateTripleCount;
          statetriple = triple;
        });
  if (targetStateTripleCount === 0 || targetStateTripleCount > 1) {
      res.status(400);
      res.send('Please supply exactly one triple with predicate http://schema.org/text or http://schema.org/image\n');
      return;
  }

  switch (statetriple.predicate.nominalValue) {
    case "http://schema.org/text":
      if (statetriple.object.interfaceName !== "Literal") {
        res.status(400);
        res.send("Please supply a Literal in object position");
        return;
      }
      collection[req.params.id] = { "text" : statetriple.object.nominalValue } ;
      break;
    case "http://schema.org/image":
      if (statetriple.object.interfaceName !== "NamedNode") {
        res.status(400);
        res.send("Please supply an URI in object position");
        return;
      }
      collection[req.params.id] = { "image" : statetriple.object.nominalValue } ;
      break;
    default:
      res.status(400);
      res.send('Please supply a triple with saref:hasState as predicate and saref:Off or saref:On as object\n');
      return;
  };

  if (overwriting)
    res.sendStatus(200);
  else
    res.sendStatus(201);
});

/**
 * DELETE one thing in the collection 
 */
app.delete('/:id', (req, res) => {
  if (req.params.id in collection) {
    delete collection[req.params.id];
    res.sendStatus(204);
  } else 
    res.sendStatus(404);
});

/**
 * DELETE everything in the collection 
 */
app.delete('/', (req, res) => {
  collection = {};
  res.sendStatus(204);
});

/**
 * Periodically updating the screen
 */
let previouslyPostedData = "";
const checknpost = function() {
  let requestPayload = [];
  const currentCollection = JSON.stringify(collection);
  if (currentCollection !== previouslyPostedData) {
    previouslyPostedData = currentCollection;
    Object.keys(collection).forEach(key => {
      requestPayload.push(collection[key]);
    });
    request({
      uri : "http://127.0.0.1:5000/",
      method : "PUT",
      timeout : 22500,
      json : requestPayload
    }, (err) => {
      if (err)
        console.log(err);
    });
  }
};
let interval;
setTimeout(function() { interval = setInterval(checknpost, 2500);console.log("first request executed");},3000)

/**
 * makes the app listen on the selected port
 */
app.listen(httpPort, () => {
    console.log('Server ready on port ' + httpPort);
});

